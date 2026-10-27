// Empresas e acesso por empresa (0031): visibilidade, papéis, revogação, conta desativada e pasta do Lume.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { companyLumePasta, companyRolesFor, createCompany, grantCompanyAccess, revokeCompanyAccess, setProjectCompany, setUserDisabled, updateCompany } from "../companies";
import { clientProjectIds, isClientOfProject, managedProjectIds, ownedProjectIds } from "../project-members";
import { projectLumePasta } from "../lume-takes";
import { findLoginUser, loginWithPassword, setUserPasswordById } from "../auth";
import { SCHEMA_STEPS } from "../migrations";

const pg = new PGlite(), d = drizzle(pg, { schema });
let dhonny: string, thalita: string, outsider: string, admin: string;
let group: string, hotel: string, lounge: string, hotelProj: string, loungeProj: string, alheio: string;

beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects, kbos_companies CASCADE");
  [{ id: dhonny }, { id: thalita }, { id: outsider }, { id: admin }] = await d.insert(schema.users).values([
    { name: "Dhonny", email: "dhonny@example.com", role: "cliente" },
    { name: "Thalita", email: "thalita@example.com", role: "cliente" },
    { name: "Fora", email: "fora@example.com", role: "cliente" },
    { name: "Admin", email: "admin@example.com", role: "admin" },
  ]).returning();
  group = (await createCompany({ name: "Grupo VIP", lumePasta: "Atalaia" })).id;
  hotel = (await createCompany({ name: "Hotel", parentId: group })).id;
  lounge = (await createCompany({ name: "Lounge", parentId: group, lumePasta: "Lounge" })).id;
  const [h, l, x] = await d.insert(schema.projects).values([
    { titulo: "Hotel — redes", categoria: "social" },
    { titulo: "Lounge — redes", categoria: "social" },
    { titulo: "VIP Carros (outro cliente com VIP no nome)", categoria: "design" },
  ]).returning();
  hotelProj = h.id; loungeProj = l.id; alheio = x.id;
  await setProjectCompany(hotelProj, hotel);
  await setProjectCompany(loungeProj, lounge);
});
afterAll(() => pg.close());

describe("empresas e acesso por empresa", () => {
  it("acesso ao grupo vale para as empresas dele; nada de projetos fora do grupo", async () => {
    expect(await clientProjectIds(dhonny)).toEqual([]);
    await grantCompanyAccess(group, "dhonny@example.com", "titular", admin);
    expect((await clientProjectIds(dhonny)).sort()).toEqual([hotelProj, loungeProj].sort());
    expect(await isClientOfProject(alheio, dhonny)).toBe(false);
    expect(await clientProjectIds(outsider)).toEqual([]);
    const roles = await companyRolesFor(dhonny);
    expect([roles.get(group), roles.get(hotel), roles.get(lounge)]).toEqual(["titular", "titular", "titular"]);
  });

  it("acesso a uma empresa não abre as irmãs", async () => {
    await grantCompanyAccess(hotel, "thalita@example.com", "acompanhar", admin);
    expect(await clientProjectIds(thalita)).toEqual([hotelProj]);
  });

  it("papéis: só titular vê cobrança; só gestão planeja", async () => {
    await grantCompanyAccess(group, "dhonny@example.com", "titular", admin);
    await grantCompanyAccess(group, "thalita@example.com", "gestao", admin);
    const ids = [hotelProj, loungeProj];
    expect((await ownedProjectIds(dhonny, ids)).sort()).toEqual(ids.sort());
    expect(await ownedProjectIds(thalita, ids)).toEqual([]);
    expect((await managedProjectIds(thalita)).sort()).toEqual(ids.sort());
    expect(await managedProjectIds(dhonny)).toEqual([]);
  });

  it("revogar tira o acesso na hora e reconceder reativa", async () => {
    await grantCompanyAccess(group, "thalita@example.com", "acompanhar", admin);
    expect(await revokeCompanyAccess(group, thalita)).toBe(true);
    expect(await clientProjectIds(thalita)).toEqual([]);
    expect(await revokeCompanyAccess(group, thalita)).toBe(false);
    await grantCompanyAccess(group, "thalita@example.com", "acompanhar", admin);
    expect(await clientProjectIds(thalita)).toHaveLength(2);
  });

  it("regras de quem recebe acesso e de grupo de um nível só", async () => {
    await expect(grantCompanyAccess(group, "admin@example.com", "titular", admin)).rejects.toThrow(/equipe/);
    await expect(grantCompanyAccess(group, "ninguem@example.com", "titular", admin)).rejects.toThrow(/Nenhuma conta/);
    await expect(createCompany({ name: "Quarto 101", parentId: hotel })).rejects.toThrow(/outro grupo/);
    await expect(updateCompany(group, { parentId: hotel })).rejects.toThrow();
    await expect(createCompany({ name: "x", lumePasta: "../etc" })).rejects.toThrow();
    expect((await createCompany({ name: "Hotel" })).slug).toBe("hotel-2");
  });

  it("pasta do Lume vem da empresa (ou do grupo), não do nome", async () => {
    expect(await companyLumePasta(loungeProj)).toBe("Lounge");
    expect(await companyLumePasta(hotelProj)).toBe("Atalaia");
    expect(await companyLumePasta(alheio)).toBeUndefined();
    await grantCompanyAccess(hotel, "thalita@example.com", "acompanhar", admin);
    expect(await projectLumePasta(hotelProj, { id: thalita, role: "cliente" })).toBe("Atalaia");
    expect(await projectLumePasta(loungeProj, { id: thalita, role: "cliente" })).toBeNull();
  });

  it("conta desativada: sessões apagadas, login recusado; admin não é desativado", async () => {
    await setUserPasswordById(thalita, "senha-segura-1");
    expect((await loginWithPassword("thalita@example.com", "senha-segura-1")).ok).toBe(true);
    await setUserDisabled(thalita, true);
    expect(await d.select().from(schema.sessions)).toHaveLength(0);
    expect(await findLoginUser("thalita@example.com")).toBeUndefined();
    expect((await loginWithPassword("thalita@example.com", "senha-segura-1")).ok).toBe(false);
    await setUserDisabled(thalita, false);
    expect((await loginWithPassword("thalita@example.com", "senha-segura-1")).ok).toBe(true);
    await expect(setUserDisabled(admin, true)).rejects.toThrow(/administrador/);
  });

  it("passos de boot são idempotentes sobre a migração SQL", async () => {
    const steps = SCHEMA_STEPS.filter((s) => s.id.startsWith("empresas."));
    expect(steps).toHaveLength(8);
    for (const s of steps) await pg.exec(s.sql);
  });
});
