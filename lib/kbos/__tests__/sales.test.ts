// PostgreSQL real e descartável (WASM), sem rede nem dados de produção.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { localDay, type SalePlan } from "../sale-plan";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
vi.mock("../whatsapp", () => ({ sendEvolutionText: vi.fn() }));
import { acceptSale, issueSaleLink, readSale, tokenHash } from "../sales";
import { handleBillingReminders } from "../billing-reminders";
import { handleNotifyWhatsapp } from "../job-handlers";
import { sendEvolutionText } from "../whatsapp";

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

describe("aceite atômico", () => {
  it("publica sem aceitar, depois conecta projeto, modelo, cobranças, agenda, cliente e funil", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    expect((await readSale(token)).tokenHash).toBe(tokenHash(token));
    expect(await count("kbos_projects")).toBe(0);
    expect((await d.select().from(schema.deals))[0].stage).toBe("proposal");
    await acceptSale(token, "Cliente de teste");
    expect(await count("kbos_projects")).toBe(1);
    expect(await count("kbos_tasks")).toBe(4);
    expect(await count("kbos_transactions")).toBe(2);
    expect(await count("kbos_events")).toBe(1);
    const bills = await d.select().from(schema.transactions);
    expect(bills.reduce((n, b) => n + Math.round(Number(b.valor) * 100), 0)).toBe(10001);
    expect(Number((await d.select().from(schema.projects))[0].valor)).toBe(100.01);
    expect(bills.every((b) => b.status === "pendente")).toBe(true);
    expect((await d.select().from(schema.contacts))[0].status).toBe("client");
    expect((await d.select().from(schema.deals))[0].stage).toBe("won");
    expect((await d.select().from(schema.budgets))[0].status).toBe("approved");
    const sale = await readSale(token);
    expect(sale.manualAccepted && sale.contractAccepted).toBe(true);
    expect(sale.signerName).toBe("Cliente de teste");
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
    const end = new Date(`${today.slice(0,7)}-28T12:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 2);
    await d.update(schema.budgets).set({ title: "Plano mensal", paymentCondition: "cash" });
    const { token } = await issueSaleLink(budgetId, { ...plan, service: "mensal", months: 3, deliveryDate: end.toISOString().slice(0,10) });
    await acceptSale(token, "Cliente");
    const bills = await d.select().from(schema.transactions);
    expect(bills).toHaveLength(3);
    expect(bills.every((b) => Number(b.valor) === 100.01)).toBe(true);
  });
});
describe("lembretes de cobrança", () => {
  it("enfileira apenas no dia e 2 dias antes; não repete e não envia se já pago", async () => {
    const { token } = await issueSaleLink(budgetId, plan);
    await acceptSale(token, "Cliente");
    expect((await handleBillingReminders()).queued).toBe(1);
    expect((await handleBillingReminders()).queued).toBe(0);
    const [job] = await d.select().from(schema.jobs);
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
