// SQL real (PGlite) das automações novas: juntar contatos, escada de cobrança e relacionamento.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
vi.mock("../whatsapp", () => ({ sendEvolutionText: vi.fn(), queueWhatsApp: vi.fn() }));
import { mergeContacts } from "../contact-merge";
import { handleBillingLadder } from "../billing-ladder";
import { handleRelationship } from "../relationship";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_budget_sales, kbos_budgets, kbos_contacts, kbos_deals, kbos_projects, kbos_tasks, kbos_transactions, kbos_events, kbos_jobs, kbos_showcases CASCADE");
});
afterAll(async () => { await pg.close(); });
const jobs = async () => (await d.select().from(schema.jobs)).map((j) => j.payload as Record<string, unknown>);

describe("juntar contatos", () => {
  it("move tudo para quem fica, completa campos e arquiva o outro", async () => {
    const [keep] = await d.insert(schema.contacts).values({ name: "Kayque Brito", phone: "5591993743109" }).returning();
    const [dup] = await d.insert(schema.contacts).values({ name: "+55 (91) 9374-3109", phone: "+55 (91) 9374-3109", email: "k@x.com", status: "client", notes: "veio do WhatsApp" }).returning();
    await d.insert(schema.transactions).values({ tipo: "entrada", descricao: "Parcela", valor: "100", contactId: dup.id });
    await d.insert(schema.deals).values({ title: "Negócio", contactId: dup.id });
    await mergeContacts(keep.id, dup.id);
    const [k] = await d.select().from(schema.contacts).where(eq(schema.contacts.id, keep.id));
    const [r] = await d.select().from(schema.contacts).where(eq(schema.contacts.id, dup.id));
    expect(k.email).toBe("k@x.com");
    expect(k.status).toBe("client");
    expect(k.notes).toContain("veio do WhatsApp");
    expect(r.status).toBe("archived");
    expect(r.phone).toBeNull();
    expect((await d.select().from(schema.transactions))[0].contactId).toBe(keep.id);
    expect((await d.select().from(schema.deals))[0].contactId).toBe(keep.id);
  });
  it("recusa o mesmo contato e id inexistente", async () => {
    const [a] = await d.insert(schema.contacts).values({ name: "A", phone: "5591999990000" }).returning();
    await expect(mergeContacts(a.id, a.id)).rejects.toThrow();
    await expect(mergeContacts(a.id, "00000000-0000-4000-8000-000000000000")).rejects.toThrow();
  });
});

const monday10h = (daysAgo: number) => { const n = new Date(); n.setUTCDate(n.getUTCDate() - daysAgo); return n; };
// uma segunda-feira às 10h de Belém (13h UTC): dentro da janela de envio
function inWindow(): Date { const n = new Date(); while (n.getUTCDay() !== 1) n.setUTCDate(n.getUTCDate() + 1); n.setUTCHours(13, 0, 0, 0); return n; }
const dayStr = (base: Date, delta: number) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + delta); return x; };

describe("escada de cobrança (SQL)", () => {
  async function seedBill(due: Date, accepted = true) {
    const [c] = await d.insert(schema.contacts).values({ name: "Maria Souza", phone: "(91) 99999-0000" }).returning();
    const [b] = await d.insert(schema.budgets).values({ code: "#1", title: "Site", contactId: c.id, totalAmount: "100" }).returning();
    const [p] = await d.insert(schema.projects).values({ titulo: "Site Loja", categoria: "sites", contactId: c.id, budgetId: b.id }).returning();
    if (accepted) await pg.query(`INSERT INTO kbos_budget_sales (budget_id, token_hash, budget_version, snapshot, plan, expires_at, accepted_at, project_id) VALUES ($1,'h',now(),'{}','{}',now()+interval '1 day',now(),$2)`, [b.id, p.id]);
    await d.insert(schema.transactions).values({ tipo: "entrada", descricao: "Parcela", valor: "100", status: "pendente", contactId: c.id, projectId: p.id, vencimento: due });
  }
  it("manda o gentil 1 dia depois, uma vez só, e nada fora do dia", async () => {
    const now = inWindow();
    await seedBill(dayStr(now, -1));
    expect((await handleBillingLadder(now)).queued).toBe(1);
    expect((await handleBillingLadder(now)).queued).toBe(0);
    const [job] = await jobs();
    expect(String(job.mensagem)).toContain("Oi, Maria!");
    expect(job.destino).toBe("5591999990000");
    await pg.exec("TRUNCATE kbos_jobs");
    expect((await handleBillingLadder(dayStr(now, 1))).queued).toBe(0); // 2 dias depois: nenhum degrau
  });
  it("não cobra fora da janela nem venda não aceita", async () => {
    const now = inWindow();
    await seedBill(dayStr(now, -1));
    expect((await handleBillingLadder(new Date(now.getTime() - 12 * 3_600_000))).queued).toBe(0);
    await pg.exec("TRUNCATE kbos_budget_sales, kbos_budgets, kbos_contacts, kbos_projects, kbos_transactions CASCADE");
    await seedBill(dayStr(now, -1), false);
    expect((await handleBillingLadder(now)).queued).toBe(0);
  });
});

describe("relacionamento (SQL)", () => {
  it("follow-up de orçamento enviado há 3 dias; não repete", async () => {
    const now = inWindow();
    const [c] = await d.insert(schema.contacts).values({ name: "Ana Lima", phone: "(91) 98888-0000" }).returning();
    const [b] = await d.insert(schema.budgets).values({ code: "#14002", title: "Plano", contactId: c.id, status: "sent", totalAmount: "300" }).returning();
    await pg.query(`UPDATE kbos_budgets SET created_at = $1 WHERE id = $2`, [dayStr(now, -3).toISOString(), b.id]);
    expect((await handleRelationship(now)).queued).toBe(1);
    expect((await handleRelationship(now)).queued).toBe(0);
    const [job] = await jobs();
    expect(String(job.mensagem)).toContain("#14002");
    expect(job.guardBudgetId).toBe(b.id);
  });
  it("pedido de depoimento 3 dias após a entrega, só sem case", async () => {
    const now = inWindow();
    const [c] = await d.insert(schema.contacts).values({ name: "Bruno Souza", phone: "(91) 97777-0000" }).returning();
    const [p] = await d.insert(schema.projects).values({ titulo: "Logo", categoria: "design", status: "entregue", contactId: c.id }).returning();
    await pg.query(`UPDATE kbos_projects SET updated_at = $1 WHERE id = $2`, [dayStr(now, -3).toISOString(), p.id]);
    expect((await handleRelationship(now)).queued).toBe(1);
    expect(String((await jobs())[0].mensagem)).toContain("portfólio");
    await pg.exec("TRUNCATE kbos_jobs");
    await d.insert(schema.showcases).values({ slug: "logo", title: "Logo", contactId: c.id, projectId: p.id });
    expect((await handleRelationship(now)).queued).toBe(0);
  });
});
void monday10h;
