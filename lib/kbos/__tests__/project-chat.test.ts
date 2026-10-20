// SQL real (PGlite): acesso ao chat do projeto e contador de não lidas.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { canAccessProject, cleanBody, listMessages, postMessage, unreadByProject, markRead } from "../project-chat";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("chat do projeto", () => {
  it("cliente só acessa o próprio projeto; equipe acessa todos", async () => {
    const [cli] = await d.insert(schema.users).values({ email: "c@x.com", name: "Cliente", role: "cliente" }).returning();
    const [outro] = await d.insert(schema.users).values({ email: "o@x.com", name: "Outro", role: "cliente" }).returning();
    const [adm] = await d.insert(schema.users).values({ email: "a@x.com", name: "Kayque", role: "admin" }).returning();
    const [p] = await d.insert(schema.projects).values({ titulo: "Site", categoria: "web", clienteId: cli.id }).returning();
    expect(await canAccessProject(cli, p.id)).toBe(true);
    expect(await canAccessProject(outro, p.id)).toBe(false);
    expect(await canAccessProject(adm, p.id)).toBe(true);
    expect(await canAccessProject(adm, "00000000-0000-0000-0000-000000000000")).toBe(false);

    await postMessage(adm, p.id, "Oi! Mandei a primeira versão.");
    await postMessage(adm, p.id, "Me diga o que acha.");
    expect((await unreadByProject(cli.id, [p.id]))[p.id]).toBe(2);
    expect((await unreadByProject(adm.id, [p.id]))[p.id]).toBe(0);
    await markRead(cli.id, p.id);
    expect((await unreadByProject(cli.id, [p.id]))[p.id]).toBe(0);
    await new Promise((r) => setTimeout(r, 5));
    await postMessage(cli, p.id, "Gostei!");
    expect((await unreadByProject(adm.id, [p.id]))[p.id]).toBe(1);
    const msgs = await listMessages(p.id);
    expect(msgs.map((m) => m.authorName)).toEqual(["Kayque", "Kayque", "Cliente"]);
  });
  it("limpa e valida o texto", () => {
    expect(cleanBody("  oi \r\n tudo  ")).toBe("oi \n tudo");
    expect(cleanBody("   ")).toBeNull();
    expect(cleanBody("x".repeat(2001))).toBeNull();
    expect(cleanBody(42)).toBeNull();
  });
});
