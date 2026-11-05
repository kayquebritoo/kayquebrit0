// PostgreSQL real e descartável (WASM), sem rede nem dados de produção.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { localDay, planEndDate, type SalePlan } from "../sale-plan";
import { readSaleFile, uploadSaleFile } from "../sale-uploads";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
vi.mock("../whatsapp", () => ({ sendEvolutionText: vi.fn() }));
import { acceptSale, confirmSalePayment, issueSaleLink, readSale, syncLeadConversionForTransaction, tokenHash, undoAcceptedSale } from "../sales";
import { handleBillingReminders } from "../billing-reminders";
import { handleNotifyWhatsapp } from "../job-handlers";
import { sendEvolutionText } from "../whatsapp";
import { companyProfileSchema } from "../planning-model";
import { adminClientPlan, publicClientPlan, saveClientPlan, publishClientPlan, reviewClientPlan, shareClientPlan, planningFile, downloadResponse } from "../planning";

const pg = new PGlite();
const d = drizzle(pg, { schema });
const today = localDay();
const later = new Date(`${today}T12:00:00Z`); later.setUTCDate(later.getUTCDate() + 10);
const delivery = later.toISOString().slice(0, 10);
const plan: SalePlan = { service: "site", startDate: today, deliveryDate: delivery, months: 1, manualUrl: "https://example.com/manual" };
let budgetId: string;
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec("TRUNCATE kbos_budget_sales, kbos_budgets, kbos_contacts, kbos_deals, kbos_projects, kbos_tasks, kbos_transactions, kbos_events, kbos_jobs CASCADE");
  const [contact] = await d.insert(schema.contacts).values({ name: "Cliente de teste", phone: "5591999999999" }).returning();
  const [budget] = await d.insert(schema.budgets).values({ code: "#14001", title: "Site", contactId: contact.id, totalAmount: "100.01", paymentCondition: "installments", items: [{ service: "Site", quantity: 1, unitPrice: 100.01, total: 100.01 }] }).returning();
  budgetId = budget.id;
});
afterAll(async () => { await pg.close(); });
const count = async (table: string) => Number((await pg.query<{ n: number }>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);

describe("manual de identidade opcional", () => {
  it("publica e aceita sem manual nem anexos", async () => {
    const { token } = await issueSaleLink(budgetId, { ...plan, manualUrl: "" });
    expect((await acceptSale(token, "Cliente")).alreadyAccepted).toBe(false);
    expect(await count("kbos_projects")).toBe(1);
  });
});

describe("desfazer aceite de teste", () => {
  it("remove os efeitos do aceite, devolve o orçamento a enviado e permite novo link", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await acceptSale(token, "Teste");
    expect(await count("kbos_projects")).toBe(1);
    await expect(undoAcceptedSale(budgetId, "errado")).rejects.toThrow();
    expect(await count("kbos_projects")).toBe(1);
    await undoAcceptedSale(budgetId, "#14001");
    for (const t of ["kbos_projects", "kbos_tasks", "kbos_transactions", "kbos_events", "kbos_client_plans", "kbos_budget_sales"]) expect(await count(t)).toBe(0);
    expect((await d.select().from(schema.budgets))[0].status).toBe("sent");
    expect((await d.select().from(schema.deals))[0].stage).toBe("proposal");
    await expect(readSale(token)).rejects.toThrow();
    await issueSaleLink(budgetId, plan);
    expect(await count("kbos_budget_sales")).toBe(1);
  });
  it("recusa se houver cobrança paga", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await acceptSale(token, "Cliente");
    await pg.exec("UPDATE kbos_transactions SET status = 'pago'");
    await expect(undoAcceptedSale(budgetId, "#14001")).rejects.toThrow();
    expect(await count("kbos_projects")).toBe(1);
  });
  it("recusa orçamento sem aceite", async () => {
    await issueSaleLink(budgetId, plan);
    await expect(undoAcceptedSale(budgetId, "#14001")).rejects.toThrow();
  });
});

describe("aceite atômico", () => {
  it("publica sem aceitar, depois conecta projeto, modelo, cobranças, agenda e funil; converte lead em cliente somente após pagamento confirmado", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    expect((await readSale(token)).tokenHash).toBe(tokenHash(token));
    expect(await count("kbos_projects")).toBe(0);
    expect((await d.select().from(schema.deals))[0].stage).toBe("proposal");
    const accepted = await acceptSale(token, "Cliente de teste");
    expect(accepted.acceptance?.verificationCode).toMatch(/^KBOS-14001-[0-9A-F]{10}$/);
    expect(await count("kbos_projects")).toBe(1);
    expect(await count("kbos_tasks")).toBe(4);
    expect(await count("kbos_transactions")).toBe(2);
    expect(await count("kbos_events")).toBe(1);
    const bills = await d.select().from(schema.transactions);
    expect(bills.reduce((n, b) => n + Math.round(Number(b.valor) * 100), 0)).toBe(10001);
    expect(Number((await d.select().from(schema.projects))[0].valor)).toBe(100.01);
    expect(bills.every((b) => b.status === "pendente")).toBe(true);
    // Regra obrigatória: aceite isolado NÃO converte lead em cliente enquanto o pagamento estiver pendente.
    expect((await d.select().from(schema.contacts))[0].status).toBe("lead");
    expect((await d.select().from(schema.deals))[0].stage).toBe("won");
    expect((await d.select().from(schema.budgets))[0].status).toBe("approved");
    const sale = await readSale(token);
    expect(sale.manualAccepted && sale.contractAccepted).toBe(true);
    expect(sale.signerName).toBe("Cliente de teste");

    // Confirmação de pagamento de cobrança vinculada à proposta aceita converte automaticamente lead -> client.
    const confirmed = await confirmSalePayment(bills[0].id);
    expect(confirmed.paymentConfirmed).toBe(true);
    expect(confirmed.clientConverted).toBe(true);
    expect((await d.select().from(schema.contacts))[0].status).toBe("client");
  });

  it("pagamento isolado sem proposta aceita não converte lead em cliente", async () => {
    const [contact] = await d.select().from(schema.contacts);
    const [looseProject] = await d
      .insert(schema.projects)
      .values({ titulo: "Projeto Avulso", categoria: "site", contactId: contact.id, valor: "500" })
      .returning();
    const [looseTx] = await d
      .insert(schema.transactions)
      .values({
        descricao: "Cobrança avulsa sem proposta aceita",
        valor: "500",
        tipo: "entrada",
        status: "pago",
        projectId: looseProject.id,
        vencimento: new Date(),
      })
      .returning();

    const syncRes = await syncLeadConversionForTransaction(looseTx.id);
    expect(syncRes.converted).toBe(false);
    expect((await d.select().from(schema.contacts))[0].status).toBe("lead");
  });

  it("executa os 4 cenários de parcelamento (1x, 2x, 3x e 4x) da Luana Nakata — Sorella Import, impede substituição silenciosa sem autorização e preserva propostas aceitas", async () => {
    const [luana] = await d
      .insert(schema.contacts)
      .values({ name: "Luana Nakata", company: "Sorella Import", status: "lead" })
      .returning();

    // Proposta 1: Landing Page (R$ 2.500,00, 7 a 12 dias úteis, em até 4x sem juros)
    const [b1] = await d
      .insert(schema.budgets)
      .values({
        code: "#14004",
        title: "Landing Page — Sorella Import",
        contactId: luana.id,
        clientName: "Luana Nakata",
        clientCompany: "Sorella Import",
        totalAmount: "2500",
        paymentCondition: "installments",
        deliveryDeadline: "7 a 12 dias úteis",
        items: [{ service: "Landing Page", description: "Landing page responsiva", quantity: 1, unitPrice: 2500, total: 2500 }],
      })
      .returning();

    // Emissão inicial (v1) com 1x sem juros
    const v1 = await issueSaleLink(
      b1.id,
      {
        service: "site",
        subtype: "Landing Page",
        startDate: today,
        deliveryDate: delivery,
        months: 1,
        paymentCondition: "cash",
        installmentsCount: 1,
        maxInstallments: 4,
        applyCashDiscount: false,
        deliveryDeadline: "7 a 12 dias úteis",
      },
      { requireReplaceConfirmation: true },
    );
    expect(v1.versionNumber).toBe(1);
    const saleV1 = await readSale(v1.token);
    expect(saleV1.snapshot.total).toBe(2500);
    expect(saleV1.snapshot.installments.map((s) => s.amount)).toEqual([2500]);
    expect(saleV1.snapshot.interestFreeOptions?.map((o) => o.installments.map((i) => i.amount))).toEqual([
      [2500],
      [1250, 1250],
      [833.34, 833.33, 833.33],
      [625, 625, 625, 625],
    ]);

    // Impede substituição silenciosa de link/snapshot ativo quando requireReplaceConfirmation = true
    await expect(
      issueSaleLink(
        b1.id,
        {
          service: "site",
          subtype: "Landing Page",
          startDate: today,
          deliveryDate: delivery,
          months: 1,
          paymentCondition: "installments",
          installmentsCount: 3,
        },
        { requireReplaceConfirmation: true },
      ),
    ).rejects.toThrow("Autorize explicitamente");

    // Com autorização explícita (replaceExisting: true), cria a versão v2 (ex.: 3x sem juros de R$ 833,34 + 2x R$ 833,33)
    const v2 = await issueSaleLink(
      b1.id,
      {
        service: "site",
        subtype: "Landing Page",
        startDate: today,
        deliveryDate: delivery,
        months: 1,
        paymentCondition: "installments",
        installmentsCount: 3,
        maxInstallments: 4,
        replaceExisting: true,
        deliveryDeadline: "7 a 12 dias úteis",
      },
      { requireReplaceConfirmation: true },
    );
    expect(v2.versionNumber).toBe(2);
    expect(v2.replacedExisting).toBe(true);
    const saleV2 = await readSale(v2.token);
    expect(saleV2.snapshot.installments.map((s) => s.amount)).toEqual([833.34, 833.33, 833.33]);

    // Proposta 2: E-commerce e Gestão (R$ 9.800,00, 45 a 60 dias, em até 4x sem juros)
    const [b2] = await d
      .insert(schema.budgets)
      .values({
        code: "#14005",
        title: "E-commerce e Gestão — Sorella Import",
        contactId: luana.id,
        clientName: "Luana Nakata",
        clientCompany: "Sorella Import",
        totalAmount: "9800",
        paymentCondition: "installments",
        deliveryDeadline: "45 a 60 dias",
        items: [{ service: "E-commerce e Gestão", description: "Loja virtual completa", quantity: 1, unitPrice: 9800, total: 9800 }],
      })
      .returning();

    const link2 = await issueSaleLink(b2.id, {
      service: "site",
      subtype: "E-commerce e Gestão",
      startDate: today,
      deliveryDate: delivery,
      months: 1,
      paymentCondition: "installments",
      installmentsCount: 2,
      maxInstallments: 4,
      deliveryDeadline: "45 a 60 dias",
    });
    const sale2 = await readSale(link2.token);
    expect(sale2.snapshot.total).toBe(9800);
    expect(sale2.snapshot.subtype).toBe("E-commerce e Gestão");
    expect(sale2.snapshot.interestFreeOptions?.map((o) => o.installments.map((i) => i.amount))).toEqual([
      [9800],
      [4900, 4900],
      [3266.68, 3266.66, 3266.66],
      [2450, 2450, 2450, 2450],
    ]);

    // Cliente escolhe 4x sem juros (4x de R$ 2.450,00) no momento do aceite
    const acc2 = await acceptSale(link2.token, "Luana Nakata", undefined, 4);
    expect(acc2.acceptance?.installments.map((i) => i.amount)).toEqual([2450, 2450, 2450, 2450]);

    // Proposta aceita não pode ser reemitida nem modificada
    await expect(
      issueSaleLink(b2.id, {
        service: "site",
        subtype: "E-commerce e Gestão",
        startDate: today,
        deliveryDate: delivery,
        months: 1,
        replaceExisting: true,
      }),
    ).rejects.toThrow("já foi aceita");

    // Verifica que 4 transações financeiras de R$ 2.450,00 foram criadas e que o 1º pagamento positivo converte Luana em client
    const b2Bills = (await d.select().from(schema.transactions)).filter((t) =>
      t.descricao.startsWith("#14005"),
    );
    expect(b2Bills).toHaveLength(4);
    expect(b2Bills.map((t) => Number(t.valor))).toEqual([2450, 2450, 2450, 2450]);
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, luana.id)))[0].status).toBe("lead");

    await confirmSalePayment(b2Bills[0].id);
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, luana.id)))[0].status).toBe("client");
  });

  it("aplica descontos progressivos via PIX (1x 10%, 2x 6%, 3x 3%, 4x 0%) nas duas propostas da Luana sem acumular descontos e registra a condição escolhida no aceite, contrato e financeiro", async () => {
    const [luana] = await d
      .insert(schema.contacts)
      .values({ name: "Luana Nakata", company: "Sorella Import", status: "lead" })
      .returning();

    // Proposta 1: Landing Page (base R$ 2.500,00)
    const [lpBudget] = await d
      .insert(schema.budgets)
      .values({
        code: "#14004",
        title: "Proposta 1 — Landing Page",
        contactId: luana.id,
        clientName: "Luana Nakata",
        clientCompany: "Sorella Import",
        totalAmount: "2500",
        paymentCondition: "cash",
        deliveryDeadline: "7 a 12 dias úteis",
        items: [{ service: "Landing Page", description: "Landing page de alta conversão", quantity: 1, unitPrice: 2500, total: 2500 }],
      })
      .returning();

    // Emissão 1 com descontos progressivos (padrão 1x à vista = R$ 2.250,00 [-10%])
    const lpLink1 = await issueSaleLink(lpBudget.id, {
      service: "site",
      subtype: "Landing Page",
      startDate: today,
      deliveryDate: delivery,
      months: 1,
      paymentCondition: "cash",
      installmentsCount: 1,
      maxInstallments: 4,
      progressiveDiscounts: true,
      applyCashDiscount: true, // Mesmo enviado true, não pode duplicar o desconto de 10%
      deliveryDeadline: "7 a 12 dias úteis",
    });

    const lpSale1 = await readSale(lpLink1.token);
    expect(lpSale1.snapshot.baseTotal).toBe(2500);
    expect(lpSale1.snapshot.total).toBe(2250);
    expect(lpSale1.snapshot.discountPercent).toBe(10);
    expect(lpSale1.snapshot.discountAmount).toBe(250);
    expect(lpSale1.snapshot.interestFreeOptions?.map((o) => ({
      count: o.count,
      discountPercent: o.discountPercent,
      total: o.total,
      amounts: o.installments.map((i) => i.amount),
    }))).toEqual([
      { count: 1, discountPercent: 10, total: 2250, amounts: [2250] },
      { count: 2, discountPercent: 6, total: 2350, amounts: [1175, 1175] },
      { count: 3, discountPercent: 3, total: 2425, amounts: [808.34, 808.33, 808.33] },
      { count: 4, discountPercent: 0, total: 2500, amounts: [625, 625, 625, 625] },
    ]);

    // Reemissão da mesma proposta NÃO acumula desconto em cima de R$ 2.250,00: mantém base R$ 2.500,00
    const lpLink2 = await issueSaleLink(lpBudget.id, {
      service: "site",
      subtype: "Landing Page",
      startDate: today,
      deliveryDate: delivery,
      months: 1,
      paymentCondition: "cash",
      installmentsCount: 1,
      maxInstallments: 4,
      progressiveDiscounts: true,
      replaceExisting: true,
      deliveryDeadline: "7 a 12 dias úteis",
    });
    const lpSale2 = await readSale(lpLink2.token);
    expect(lpSale2.snapshot.baseTotal).toBe(2500);
    expect(lpSale2.snapshot.total).toBe(2250);

    // No aceite da Landing Page, Luana escolhe 3x com 3% OFF (R$ 2.425,00 = 808.34 + 808.33 + 808.33)
    const lpAccepted = await acceptSale(lpLink2.token, "Luana Nakata", undefined, 3);
    expect(lpAccepted.acceptance?.total).toBe(2425);
    expect(lpAccepted.acceptance?.installments.map((i) => i.amount)).toEqual([808.34, 808.33, 808.33]);

    const lpSaleAfter = await readSale(lpLink2.token);
    expect(lpSaleAfter.snapshot.total).toBe(2425);
    expect(lpSaleAfter.snapshot.discountPercent).toBe(3);
    expect(lpSaleAfter.snapshot.discountAmount).toBe(75);
    expect(lpSaleAfter.snapshot.clauses[4].body).toContain("3% de desconto progressivo");
    expect(lpSaleAfter.snapshot.clauses[4].body).toMatch(/R\$\s2\.425,00/);

    const [lpBudgetAfter] = await d.select().from(schema.budgets).where(eq(schema.budgets.id, lpBudget.id));
    expect(lpBudgetAfter.status).toBe("approved");
    expect(Number(lpBudgetAfter.totalAmount)).toBe(2425);
    expect(Number(lpBudgetAfter.discountValue)).toBe(3);

    const lpBills = (await d.select().from(schema.transactions)).filter((t) =>
      t.descricao.startsWith("#14004"),
    );
    expect(lpBills.map((t) => Number(t.valor))).toEqual([808.34, 808.33, 808.33]);

    // Proposta 2: E-commerce e Gestão (base R$ 9.800,00)
    const [ecomBudget] = await d
      .insert(schema.budgets)
      .values({
        code: "#14005",
        title: "Proposta 2 — E-commerce e Gestão",
        contactId: luana.id,
        clientName: "Luana Nakata",
        clientCompany: "Sorella Import",
        totalAmount: "9800",
        paymentCondition: "cash",
        deliveryDeadline: "45 a 60 dias",
        items: [{ service: "E-commerce e Gestão", description: "Loja virtual completa", quantity: 1, unitPrice: 9800, total: 9800 }],
      })
      .returning();

    const ecomLink = await issueSaleLink(ecomBudget.id, {
      service: "site",
      subtype: "E-commerce e Gestão",
      startDate: today,
      deliveryDate: delivery,
      months: 1,
      paymentCondition: "cash",
      installmentsCount: 1,
      maxInstallments: 4,
      progressiveDiscounts: true,
      deliveryDeadline: "45 a 60 dias",
    });

    const ecomSale = await readSale(ecomLink.token);
    expect(ecomSale.snapshot.interestFreeOptions?.map((o) => ({
      count: o.count,
      discountPercent: o.discountPercent,
      discountAmount: o.discountAmount,
      total: o.total,
      amounts: o.installments.map((i) => i.amount),
    }))).toEqual([
      { count: 1, discountPercent: 10, discountAmount: 980, total: 8820, amounts: [8820] },
      { count: 2, discountPercent: 6, discountAmount: 588, total: 9212, amounts: [4606, 4606] },
      { count: 3, discountPercent: 3, discountAmount: 294, total: 9506, amounts: [3168.68, 3168.66, 3168.66] },
      { count: 4, discountPercent: 0, discountAmount: 0, total: 9800, amounts: [2450, 2450, 2450, 2450] },
    ]);

    // No aceite do E-commerce, Luana escolhe 2x com 6% OFF (R$ 9.212,00 = 2x de R$ 4.606,00)
    const ecomAccepted = await acceptSale(ecomLink.token, "Luana Nakata", undefined, 2);
    expect(ecomAccepted.acceptance?.total).toBe(9212);
    expect(ecomAccepted.acceptance?.installments.map((i) => i.amount)).toEqual([4606, 4606]);

    // Confirmação manual do 1º pagamento PIX converte Lead em Cliente
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, luana.id)))[0].status).toBe("lead");
    await confirmSalePayment(lpBills[0].id);
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, luana.id)))[0].status).toBe("client");
  });
  it("cliques repetidos ou concorrentes não duplicam a venda", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await Promise.all([acceptSale(token, "Cliente"), acceptSale(token, "Cliente")]);
    expect((await acceptSale(token, "Outro nome")).alreadyAccepted).toBe(true);
    expect(await count("kbos_projects")).toBe(1);
    expect(await count("kbos_transactions")).toBe(2);
    expect((await readSale(token)).signerName).toBe("Cliente");
  });
  it("reverte todos os efeitos se uma cobrança falhar", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await pg.exec("ALTER TABLE kbos_transactions ADD CONSTRAINT fail_sale CHECK (valor < 1)");
    try {
      await expect(acceptSale(token, "Cliente")).rejects.toThrow();
      expect(await count("kbos_projects")).toBe(0);
      expect(await count("kbos_tasks")).toBe(0);
      expect(await count("kbos_client_plans")).toBe(0);
      expect((await readSale(token)).acceptedAt).toBeNull();
      expect((await d.select().from(schema.budgets))[0].status).toBe("sent");
    } finally { await pg.exec("ALTER TABLE kbos_transactions DROP CONSTRAINT fail_sale"); }
  });
  it("reemissão revoga link anterior sem duplicar negociação; edição invalida o aceite", async () => {
    const first = await issueSaleLink(budgetId, plan);
    const second = await issueSaleLink(budgetId, plan);
    await expect(readSale(first.token)).rejects.toThrow("Link não encontrado");
    expect(await count("kbos_deals")).toBe(1);
    await d.update(schema.budgets).set({ title: "Nova versão", updatedAt: new Date(Date.now() + 1000) }).where(eq(schema.budgets.id, budgetId));
    await expect(acceptSale(second.token, "Cliente")).rejects.toThrow("atualizada");
    expect(await count("kbos_projects")).toBe(0);
  });
  it("expiração e cancelamento impedem aceite", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await d.update(schema.budgetSales).set({ expiresAt: new Date(0) });
    await expect(acceptSale(token, "Cliente")).rejects.toThrow("expirou");
    await d.update(schema.budgetSales).set({ expiresAt: new Date(Date.now() + 60000) });
    await d.update(schema.budgets).set({ status: "cancelled" });
    await expect(acceptSale(token, "Cliente")).rejects.toThrow("cancelada");
  });
  it("plano mensal gera uma cobrança integral por mês sem desconto", async () => {
    await d.update(schema.budgets).set({ title: "Plano mensal", paymentCondition: "cash" });
    const { token } = await issueSaleLink(budgetId, { ...plan, service: "mensal", months: 3, deliveryDate: planEndDate(today, 3) });
    await acceptSale(token, "Cliente");
    const bills = await d.select().from(schema.transactions);
    expect(bills).toHaveLength(3);
    expect(bills.every((b) => Number(b.valor) === 100.01)).toBe(true);
  });
});
describe("marca e planejamento após assinatura", () => {
  async function acceptedBrand() {
    const file = await uploadSaleFile(budgetId,"logo.png",Buffer.from("89504e470d0a1a0a00","hex"),{source:"client"});
    const profile = companyProfileSchema.parse({companyName:"Marca do cliente",contactName:"Pessoa responsável",email:"cliente@example.com",concept:"Conceito informado pelo cliente",audience:"Público informado",tone:"Próximo e claro",objective:"Objetivo informado",colors:[{name:"Azul",hex:"#254C88"}],logoId:file.id,assets:[{fileId:file.id,name:file.name,category:"logo"}]});
    const {token}=await issueSaleLink(budgetId,plan);
    const accepted=await acceptSale(token,"Pessoa responsável",profile);
    const [row]=await d.select().from(schema.clientPlans);
    return {token,profile,file,row,accepted};
  }
  it("preserva a marca assinada, cria uma página em preparação e atualiza o CRM sem alterar preço",async()=>{
    const {token,profile,row,accepted}=await acceptedBrand();
    expect(accepted.planningUrl).toBe(`/planejamento/${token}/`);
    expect(row.signedProfile.companyName).toBe(profile.companyName);
    expect(row.draft.concept).toBe(profile.concept);
    expect(row.draft.positioning).toBe("");
    expect((await publicClientPlan(token)).document).toBeNull();
    const [contact]=await d.select().from(schema.contacts);
    expect(contact.company).toBe(profile.companyName);
    expect(contact.email).toBe(profile.email);
    expect(Number((await d.select().from(schema.budgets))[0].totalAmount)).toBe(100.01);
    await acceptSale(token,"Outro nome",{companyName:"Não pode reescrever"});
    expect(await count("kbos_client_plans")).toBe(1);
    expect((await d.select().from(schema.clientPlans))[0].signedProfile.companyName).toBe(profile.companyName);
  });
  it("não publica marca incompleta nem aceita revisões antigas do editor",async()=>{
    const {row,token}=await acceptedBrand();
    await expect(publishClientPlan(row.id,1)).rejects.toThrow("Complete antes de publicar");
    const doc=structuredClone(row.draft);doc.positioning="Versão da equipe";doc.typography={heading:"Manrope",body:"Manrope",usage:"Títulos claros"};
    const saved=await saveClientPlan(row.id,1,doc);
    await expect(saveClientPlan(row.id,1,{...doc,positioning:"Alteração perdida"})).rejects.toThrow("outra janela");
    expect((await publicClientPlan(token)).document).toBeNull();
    await publishClientPlan(row.id,saved.draftRevision);
    expect((await publicClientPlan(token)).document?.positioning).toBe("Versão da equipe");
    doc.positioning="Rascunho privado";await saveClientPlan(row.id,saved.draftRevision,doc);
    expect((await publicClientPlan(token)).document?.positioning).toBe("Versão da equipe");
  });
  it("aprovação vale para a versão publicada, é idempotente e reabre em uma nova publicação",async()=>{
    const {row,token}=await acceptedBrand();
    const doc={...row.draft,positioning:"Posicionamento",typography:{heading:"Manrope",body:"Manrope",usage:""}};
    let saved=await saveClientPlan(row.id,1,doc);await publishClientPlan(row.id,saved.draftRevision);
    await expect(reviewClientPlan(token,{action:"approve",version:1,name:"Cliente"})).rejects.toThrow("confirmação");
    await reviewClientPlan(token,{action:"approve",version:1,name:"Cliente",confirmed:true});
    await reviewClientPlan(token,{action:"approve",version:1,name:"Cliente",confirmed:true});
    expect((await publicClientPlan(token)).feedback).toHaveLength(1);
    saved=await saveClientPlan(row.id,saved.draftRevision,{...doc,tone:"Novo tom"});await publishClientPlan(row.id,saved.draftRevision);
    const published=await publicClientPlan(token);expect(published.version).toBe(2);expect(published.approvedAt).toBeNull();expect(published.status).toBe("review");
    await expect(reviewClientPlan(token,{action:"approve",version:1,name:"Cliente",confirmed:true})).rejects.toThrow("nova versão");
    await reviewClientPlan(token,{action:"feedback",version:2,name:"Cliente",section:"marca",message:"Gostaria de uma paleta mais clara."});
    const reviewed=await publicClientPlan(token);expect(reviewed.status).toBe("changes");expect(reviewed.feedback).toHaveLength(2);
  });
  it("não expõe arquivos de rascunho e permite compartilhar e revogar o link de planejamento",async()=>{
    const {row,token,file}=await acceptedBrand();
    expect((await planningFile(token,file.id)).name).toBe("logo.png");
    const unpublished=await uploadSaleFile(budgetId,"rascunho.txt",Buffer.from("Privado da equipe"),{allowAccepted:true});
    await expect(planningFile(token,unpublished.id)).rejects.toThrow("Arquivo não encontrado");
    const first=(await shareClientPlan(row.id)).split('/')[2];expect((await publicClientPlan(first)).profile.companyName).toBe("Marca do cliente");
    const second=(await shareClientPlan(row.id)).split('/')[2];await expect(publicClientPlan(first)).rejects.toThrow("Link não encontrado");
    expect((await publicClientPlan(second)).status).toBe("draft");
    expect((await adminClientPlan(row.id)).plan.signedProfile.companyName).toBe("Marca do cliente");
    const vector=downloadResponse({name:"marca.svg",mime:"image/svg+xml",bytes:Buffer.from('<svg></svg>')},true);
    expect(vector.headers.get('content-disposition')).toContain('attachment');expect(vector.headers.get('content-security-policy')).toContain('sandbox');
  });
  it("um arquivo da equipe não pode ser forjado como material enviado pelo contratante",async()=>{
    const file=await uploadSaleFile(budgetId,"manual.pdf",Buffer.from("%PDF-1.4\n"));
    const {token}=await issueSaleLink(budgetId,plan);
    await expect(acceptSale(token,"Cliente",{companyName:"Cliente",assets:[{fileId:file.id,name:"Logo",category:"logo"}],logoId:file.id})).rejects.toThrow("materiais enviados");
    expect(await count("kbos_client_plans")).toBe(0);
  });
});
describe("arquivos da proposta", () => {
  const pdf = Buffer.from("%PDF-1.4\nArquivo de teste\n%%EOF");
  it("preserva bytes, valida vínculo e congela metadados na proposta", async () => {
    const file = await uploadSaleFile(budgetId, "Manual da marca.pdf", pdf);
    const { token } = await issueSaleLink(budgetId, { ...plan, manualUrl: "", attachments: [{ kind: "file", fileId: file.id, name: "nome forjado", role: "manual", sha256: "falso" }] });
    const sale = await readSale(token);
    expect(sale.plan.attachments?.[0]).toMatchObject({ name: "Manual da marca.pdf", sha256: file.sha256, size: pdf.length });
    expect((await readSaleFile(token, file.id)).bytes.equals(pdf)).toBe(true);
    const other = await uploadSaleFile(budgetId, "Outra referência.pdf", pdf);
    await expect(readSaleFile(token, other.id)).rejects.toThrow("Arquivo não encontrado");
    await acceptSale(token, "Cliente de teste");
    expect((await readSaleFile(token, file.id)).bytes.equals(pdf)).toBe(true);
    await expect(uploadSaleFile(budgetId, "Alterado.pdf", pdf)).rejects.toThrow("não está disponível");
  });
  it("não aceita arquivo de outro orçamento nem link revogado", async () => {
    const file = await uploadSaleFile(budgetId, "Manual.pdf", pdf);
    const first = await issueSaleLink(budgetId, { ...plan, attachments: [{ kind: "file", fileId: file.id, name: file.name, role: "reference" }] });
    await issueSaleLink(budgetId, plan);
    await expect(readSaleFile(first.token, file.id)).rejects.toThrow("Link não encontrado");
    const [other] = await d.insert(schema.budgets).values({ code: "#14002", title: "Outro", contactId: (await d.select().from(schema.contacts))[0].id, totalAmount: "100", paymentCondition: "cash" }).returning();
    await expect(issueSaleLink(other.id, { ...plan, attachments: [{ kind: "file", fileId: file.id, name: "Manual.pdf", role: "manual" }] })).rejects.toThrow("não pertence");
  });
  it("limita armazenamento por orçamento de forma atômica", async () => {
    await d.update(schema.budgets).set({ uploadBytes: 52428800 - pdf.length });
    await uploadSaleFile(budgetId, "Último.pdf", pdf);
    await expect(uploadSaleFile(budgetId, "Excesso.pdf", pdf)).rejects.toThrow("50 MB");
    await d.delete(schema.budgets).where(eq(schema.budgets.id, budgetId));
    expect(await count("kbos_budget_uploads")).toBe(0);
  });
});
describe("lembretes de cobrança", () => {
  it("enfileira apenas no dia e 2 dias antes; não repete e não envia se já pago", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await acceptSale(token, "Cliente");
    await d.update(schema.contacts).set({ phone: "(91) 99999-9999" });
    expect((await handleBillingReminders()).queued).toBe(1);
    expect((await handleBillingReminders()).queued).toBe(0);
    const [job] = await d.select().from(schema.jobs);
    expect(job.payload.destino).toBe("5591999999999");
    await d.update(schema.transactions).set({ status: "pago" });
    const result = await handleNotifyWhatsapp(job.payload as unknown as Parameters<typeof handleNotifyWhatsapp>[0]);
    expect(result).toEqual({ skipped: true });
    expect(sendEvolutionText).not.toHaveBeenCalled();
    const afterTwoDays = new Date(`${today}T12:00:00Z`); afterTwoDays.setUTCDate(afterTwoDays.getUTCDate() + 2);
    await d.update(schema.transactions).set({ status: "pendente", vencimento: afterTwoDays });
    expect((await handleBillingReminders()).queued).toBe(2);
    expect((await handleBillingReminders()).queued).toBe(0);
  });
});
