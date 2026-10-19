// Importação dos cases do site (lib/data.ts) para o painel: PostgreSQL real e descartável (WASM).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";
import { PROJECTS } from "../../data";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { importLegacyCases, legacyPending, listCasesAdmin } from "../showcase";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
beforeEach(async () => { await pg.exec("TRUNCATE kbos_showcases CASCADE"); });
afterAll(async () => { await pg.close(); });

describe("importar cases do site", () => {
  it("traz todos, no ar, e não duplica na segunda vez", async () => {
    expect((await legacyPending()).length).toBe(PROJECTS.length);
    const first = await importLegacyCases();
    expect(first.imported.length).toBe(PROJECTS.length);
    const items = await listCasesAdmin();
    expect(items.length).toBe(PROJECTS.length);
    expect(items.every((c) => c.status === "published" && c.verdict.ok)).toBe(true);
    expect((await legacyPending()).length).toBe(0);
    expect((await importLegacyCases()).imported).toEqual([]);
    expect((await listCasesAdmin()).length).toBe(PROJECTS.length);
  });
  it("não sobrescreve um case que já existe com o mesmo endereço", async () => {
    await d.insert(schema.showcases).values({ slug: PROJECTS[0].slug, title: "Editado por mim" });
    const r = await importLegacyCases();
    expect(r.imported).not.toContain(PROJECTS[0].slug);
    expect((await listCasesAdmin()).find((c) => c.slug === PROJECTS[0].slug)?.title).toBe("Editado por mim");
  });
});
