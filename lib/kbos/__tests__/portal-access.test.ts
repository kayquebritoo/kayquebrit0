import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { grantPortalAccess, normalizePhone } from "../portal-access";

const pg = new PGlite();
const d = drizzle(pg, { schema });
let contactId: string;

beforeAll(async () => {
  holder.db = d;
  for (const f of readdirSync("drizzle").filter((x) => /^\d.*\.sql$/.test(x)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users CASCADE; TRUNCATE kbos_contacts CASCADE;");
  const [c] = await d.insert(schema.contacts).values({ name: "Thalita", email: "thalita@example.com", phone: "(91) 98888-7777", company: "Atalaia Vip" }).returning();
  contactId = c.id;
  await d.insert(schema.projects).values([{ titulo: "Hotel", categoria: "video", contactId }, { titulo: "Lounge", categoria: "video", contactId }]);
});
afterAll(() => pg.close());

describe("telefone do login por WhatsApp", () => {
  it("coloca o DDI 55 em números brasileiros", () => {
    expect(normalizePhone("(91) 99999-8888")).toBe("5591999998888");
    expect(normalizePhone("91 3333-4444")).toBe("559133334444");
  });
  it("mantém quem já tem DDI e rejeita lixo", () => {
    expect(normalizePhone("+55 91 99999-8888")).toBe("5591999998888");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("acesso ao portal", () => {
  it("cria a conta de cliente com telefone no formato do login e liga os projetos", async () => {
    const r = await grantPortalAccess({ contactId });
    expect(r.ok && r.created && r.linked).toBe(2);
    const [u] = await d.select().from(schema.users);
    expect(u.role).toBe("cliente");
    expect(u.phone).toBe("5591988887777");
    const ps = await d.select().from(schema.projects);
    expect(ps.every((p) => p.clienteId === u.id)).toBe(true);
  });
  it("é idempotente e não rouba projeto já ligado a outra conta", async () => {
    await grantPortalAccess({ contactId });
    const again = await grantPortalAccess({ contactId });
    expect(again.ok && !again.created && again.linked).toBe(0);
    expect(await d.select().from(schema.users)).toHaveLength(1);
  });
  it("liga como acesso compartilhado os projetos da mesma empresa, sem virar titular", async () => {
    const [dona] = await d.insert(schema.users).values({ email: "dona@example.com", name: "Dona", role: "cliente" }).returning();
    const [outro] = await d.insert(schema.contacts).values({ name: "Dona", email: "dona@example.com", company: " atalaia VIP " }).returning();
    const [hotel] = await d.insert(schema.projects).values({ titulo: "Social", categoria: "social", contactId: outro.id, clienteId: dona.id }).returning();
    const [porTitulo] = await d.insert(schema.projects).values({ titulo: "Atalaia Vip", categoria: "social" }).returning();
    await d.insert(schema.projects).values({ titulo: "Alheio", categoria: "design" });
    const r = await grantPortalAccess({ contactId });
    expect(r.ok && r.linked).toBe(4);
    expect(r.ok && [...r.projects].sort()).toEqual(["Atalaia Vip", "Hotel", "Lounge", "Social"]);
    const members = await d.select().from(schema.projectMembers);
    expect(members.map((m) => m.projectId).sort()).toEqual([hotel.id, porTitulo.id].sort());
    expect((await d.select().from(schema.projects).where(eq(schema.projects.id, hotel.id)))[0].clienteId).toBe(dona.id);
    const again = await grantPortalAccess({ contactId });
    expect(again.ok && again.linked).toBe(0);
    expect(await d.select().from(schema.projectMembers)).toHaveLength(2);
    const { suggestProjectMembers } = await import("../project-members");
    expect(await suggestProjectMembers(hotel.id)).toEqual([]);
    await d.delete(schema.projectMembers);
    expect((await suggestProjectMembers(hotel.id)).map((u) => u.email)).toEqual(["thalita@example.com"]);
  });
  it("recusa e-mail de administrador e e-mail inválido", async () => {
    await d.insert(schema.users).values({ email: "dono@example.com", name: "Dono", role: "admin" });
    expect((await grantPortalAccess({ contactId, email: "dono@example.com" })).ok).toBe(false);
    expect((await grantPortalAccess({ contactId, email: "sem-arroba" })).ok).toBe(false);
    expect((await d.select().from(schema.users).where(eq(schema.users.role, "cliente")))).toHaveLength(0);
  });
});
