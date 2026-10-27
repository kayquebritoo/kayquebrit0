// Rotas reais de projeto vistas por um cliente: só os projetos dele e só os campos liberados
// (valor do contrato, orçamento, briefing e contato ficam com a equipe).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown, user: null as unknown }));
vi.mock("@/lib/kbos/db", () => ({ db: () => holder.db }));
vi.mock("@/lib/kbos/rbac", async (orig) => ({ ...(await orig<typeof import("../rbac")>()), sessionUser: async () => holder.user }));
import { GET as listProjects } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[id]/route";
import { addProjectMember } from "../project-members";

const pg = new PGlite(), d = drizzle(pg, { schema });
const INTERNAL = ["valor", "budgetId", "briefingId", "contactId", "clienteId", "courseId", "postLimit"];
let owner: typeof schema.users.$inferSelect, member: typeof schema.users.$inferSelect, staff: typeof schema.users.$inferSelect;
let mine: string, other: string;
const asUser = (u: unknown) => { holder.user = u; };
const detail = (id: string) => getProject(new Request(`http://x/api/projects/${id}`), { params: Promise.resolve({ id }) });

beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects, kbos_contacts CASCADE");
  [owner, member, staff] = await d.insert(schema.users).values([
    { name: "Titular", email: "titular@example.com", role: "cliente" },
    { name: "Marketing", email: "mkt@example.com", role: "cliente" },
    { name: "Designer", email: "designer@example.com", role: "designer" },
  ]).returning();
  const [c] = await d.insert(schema.contacts).values({ name: "Contato interno" }).returning();
  const [p, q] = await d.insert(schema.projects).values([
    { titulo: "Grupo Teste", categoria: "social", clienteId: owner.id, valor: "4500", contactId: c.id, recurring: true },
    { titulo: "Alheio", categoria: "design", valor: "9999" },
  ]).returning();
  mine = p.id; other = q.id;
  await addProjectMember(mine, "mkt@example.com");
});
afterAll(() => pg.close());

describe("projetos vistos pelo cliente", () => {
  it("lista: titular e membro veem só o próprio projeto, sem campos internos", async () => {
    for (const u of [owner, member]) {
      asUser(u);
      const { items } = await (await listProjects()).json();
      expect(items.map((p: { id: string }) => p.id)).toEqual([mine]);
      for (const k of INTERNAL) expect(items[0]).not.toHaveProperty(k);
      expect(items[0]).toMatchObject({ titulo: "Grupo Teste", categoria: "social", recurring: true });
    }
  });

  it("detalhe: sem campos internos para o cliente; projeto alheio dá 403", async () => {
    asUser(member);
    const res = await detail(mine);
    expect(res.status).toBe(200);
    const { item } = await res.json();
    for (const k of INTERNAL) expect(item).not.toHaveProperty(k);
    expect((await detail(other)).status).toBe(403);
  });

  it("equipe continua vendo tudo", async () => {
    asUser(staff);
    const { items } = await (await listProjects()).json();
    expect(items).toHaveLength(2);
    expect(items.find((p: { id: string }) => p.id === mine)).toMatchObject({ valor: "4500", contactName: "Contato interno" });
    expect((await (await detail(mine)).json()).item.valor).toBe("4500");
  });

  it("sem sessão: 401", async () => {
    asUser(null);
    expect((await listProjects()).status).toBe(401);
    expect((await detail(mine)).status).toBe(401);
  });
});
