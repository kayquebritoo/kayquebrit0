import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { addProjectMember, clientProjectIds, isClientOfProject, listProjectMembers, projectClientUsers, removeProjectMember } from "../project-members";
import { portalPosts, decidePost, createClientRoteiro } from "../social-posts";
import { canAccessProject } from "../project-chat";
import { SCHEMA_STEPS } from "../migrations";

const pg = new PGlite(), d = drizzle(pg, { schema });
let owner: string, thalita: string, outsider: string, project: string, other: string;
beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects CASCADE");
  const [o, t, x] = await d.insert(schema.users).values([
    { name: "Adélia", email: "adelia@example.com", role: "cliente", phone: "5591900000001" },
    { name: "Thalita", email: "thalita@example.com", role: "cliente", phone: "5591900000002" },
    { name: "Fora", email: "fora@example.com", role: "cliente" },
  ]).returning();
  owner = o.id; thalita = t.id; outsider = x.id;
  const [p, q] = await d.insert(schema.projects).values([{ titulo: "Grupo Atalaia Vip", categoria: "social", clienteId: owner }, { titulo: "Outro", categoria: "design", clienteId: outsider }]).returning();
  project = p.id; other = q.id;
});
afterAll(() => pg.close());

describe("acesso compartilhado ao projeto", () => {
  it("membro passa a ver o projeto, sem tirar o titular e sem ver projetos alheios", async () => {
    expect(await isClientOfProject(project, thalita)).toBe(false);
    const r = await addProjectMember(project, " Thalita@Example.com ");
    expect(r.ok).toBe(true);
    expect(await clientProjectIds(thalita)).toEqual([project]);
    expect(await isClientOfProject(project, owner)).toBe(true);
    expect(await isClientOfProject(other, thalita)).toBe(false);
    expect(await canAccessProject({ id: thalita, role: "cliente" }, project)).toBe(true);
    expect(await canAccessProject({ id: thalita, role: "cliente" }, other)).toBe(false);
    expect((await listProjectMembers(project)).map((m) => m.email)).toEqual(["thalita@example.com"]);
    expect((await projectClientUsers(project)).map((u) => u.id).sort()).toEqual([owner, thalita].sort());
  });
  it("calendário: membro vê, aprova e cria roteiro no projeto compartilhado", async () => {
    const [post] = await d.insert(schema.socialPosts).values({ projectId: project, title: "Pôr do sol", format: "reels", status: "aprovacao", scheduledAt: new Date("2026-11-02T18:00:00-03:00") }).returning();
    expect(await portalPosts(thalita)).toHaveLength(0);
    await expect(decidePost(thalita, post.id, "aprovar")).rejects.toThrow();
    await addProjectMember(project, "thalita@example.com");
    expect((await portalPosts(thalita)).map((p) => p.id)).toEqual([post.id]);
    await decidePost(thalita, post.id, "aprovar");
    await createClientRoteiro(thalita, { projectId: project, date: "2026-11-05", title: "Ideia da Thalita", format: "carrossel" });
    await expect(createClientRoteiro(thalita, { projectId: other, date: "2026-11-05", title: "Invasão", format: "carrossel" })).rejects.toThrow();
  });
  it("remover tira o acesso; regras de quem pode entrar", async () => {
    await addProjectMember(project, "thalita@example.com");
    expect((await addProjectMember(project, "thalita@example.com")).ok).toBe(true);
    expect(await listProjectMembers(project)).toHaveLength(1);
    expect(await removeProjectMember(project, thalita)).toBe(true);
    expect(await clientProjectIds(thalita)).toEqual([]);
    expect((await addProjectMember(project, "ninguem@example.com")).ok).toBe(false);
    expect((await addProjectMember(project, "adelia@example.com")).ok).toBe(false);
    await d.insert(schema.users).values({ name: "Equipe", email: "equipe@example.com", role: "designer" });
    expect((await addProjectMember(project, "equipe@example.com")).ok).toBe(false);
  });
  it("passo de boot cria a mesma tabela que a migração SQL", async () => {
    const steps = SCHEMA_STEPS.filter((s) => s.id.startsWith("projects.members."));
    expect(steps).toHaveLength(3);
    for (const s of steps) await pg.exec(s.sql);
  });
});
