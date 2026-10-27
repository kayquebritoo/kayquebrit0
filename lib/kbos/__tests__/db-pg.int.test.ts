// Driver PostgreSQL convencional (DATABASE_DRIVER=pg): batch atômico e
// mapeamento de colunas iguais ao Neon HTTP. Só roda contra um banco
// DESCARTÁVEL apontado por KBOS_TEST_PG_URL (nunca produção). Sem ela, é pulado.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const URL = process.env.KBOS_TEST_PG_URL;
const T = "kbos_test_driver_tmp";
const tmp = pgTable(T, {
  id: serial("id").primaryKey(),
  someName: text("some_name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

describe.skipIf(!URL)("db() com DATABASE_DRIVER=pg", () => {
  let mod: typeof import("../db");
  beforeAll(async () => {
    process.env.DATABASE_DRIVER = "pg";
    process.env.DATABASE_URL = URL;
    mod = await import("../db");
    await mod.db().execute(sql.raw(`DROP TABLE IF EXISTS ${T}; CREATE TABLE ${T} (id serial primary key, some_name text not null unique, created_at timestamptz not null default now())`));
  });
  afterAll(async () => {
    await mod.db().execute(sql.raw(`DROP TABLE IF EXISTS ${T}`));
    await (mod.db() as unknown as { end: () => Promise<void> }).end();
  });

  it("usa o driver pg e mapeia colunas para camelCase", async () => {
    expect(mod.dbDriver()).toBe("pg");
    const [row] = await mod.db().insert(tmp).values({ someName: "a" }).returning();
    expect(row.someName).toBe("a");
    expect(row.createdAt).toBeInstanceOf(Date);
    const res = await mod.db().execute(sql`select count(*)::int as n from ${tmp}`);
    expect((res.rows[0] as { n: number }).n).toBe(1);
  });

  it("batch devolve um resultado por query, em ordem", async () => {
    const d = mod.db();
    const [ins, sel] = await d.batch([
      d.insert(tmp).values({ someName: "b" }).returning({ someName: tmp.someName }),
      d.select().from(tmp).where(eq(tmp.someName, "b")),
    ]);
    expect(ins).toEqual([{ someName: "b" }]);
    expect(sel).toHaveLength(1); // a 2ª query enxerga a 1ª: mesma transação
  });

  it("batch é atômico: falhou uma, nenhuma grava", async () => {
    const d = mod.db();
    await expect(d.batch([
      d.insert(tmp).values({ someName: "c" }).returning(),
      d.insert(tmp).values({ someName: "a" }).returning(), // duplicado → 23505
    ])).rejects.toSatisfy((e: unknown) => mod.isConflict(e));
    const c = await d.select().from(tmp).where(eq(tmp.someName, "c"));
    expect(c).toHaveLength(0);
    // A conexão do batch voltou ao pool limpa: queries seguintes funcionam.
    expect(await d.select().from(tmp)).toHaveLength(2);
  });
});
