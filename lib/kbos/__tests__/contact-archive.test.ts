import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { archiveLeads, isNameless } from "../contact-archive";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("arquivar leads em lote", () => {
  it("detecta nome só número", () => {
    expect(isNameless("+55 91 99374-3109")).toBe(true);
    expect(isNameless("Sem nome")).toBe(true);
    expect(isNameless("")).toBe(true);
    expect(isNameless("Caio Leonel")).toBe(false);
  });
  it("arquiva só lead; cliente fica", async () => {
    const [a] = await d.insert(schema.contacts).values({ name: "5591999990001", status: "lead" }).returning();
    const [b] = await d.insert(schema.contacts).values({ name: "5591999990002", status: "client" }).returning();
    expect(await archiveLeads([a.id, b.id])).toBe(1);
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, a.id)))[0].status).toBe("archived");
    expect((await d.select().from(schema.contacts).where(eq(schema.contacts.id, b.id)))[0].status).toBe("client");
  });
});
