import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { parseMoney, parseDate, parseOfx, parseStatement, withKeys, guessCategory } from "../statement-import";
import { commitStatement, previewStatement } from "../statement-import-db";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("números e datas", () => {
  it("lê valores em formato brasileiro", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("-R$ 12,30")).toBe(-12.3);
    expect(parseMoney("12.50")).toBe(12.5);
    expect(parseMoney("(45,00)")).toBe(-45);
    expect(parseMoney("abc")).toBeNull();
  });
  it("lê datas", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("2026-10-05 14:30")).toBe("2026-10-05");
    expect(parseDate("20261005120000")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("CSV e OFX", () => {
  it("CSV com valor negativo e ponto e vírgula", () => {
    const csv = "Data;Descrição;Valor\n05/10/2026;iFood *Pizzaria;-45,90\n06/10/2026;Pix recebido João;1.200,00\n";
    const rows = parseStatement(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tipo: "saida", valor: 45.9, categoria: "Alimentação" });
    expect(rows[1]).toMatchObject({ tipo: "entrada", valor: 1200 });
  });
  it("CSV com coluna de tipo", () => {
    const csv = "Data,Tipo,Estabelecimento,Valor\n2026-10-05,Compra,Uber,18.40\n2026-10-07,Crédito,Cashback,2.00\n";
    const rows = parseStatement(csv);
    expect(rows.map((r) => r.tipo)).toEqual(["saida", "entrada"]);
  });
  it("OFX", () => {
    const ofx = "<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005120000<TRNAMT>-30.00<MEMO>Netflix</STMTTRN><STMTTRN><DTPOSTED>20261006<TRNAMT>500.00<NAME>Pix cliente</STMTTRN></OFX>";
    const rows = parseOfx(ofx);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tipo: "saida", valor: 30, categoria: "Assinaturas" });
    expect(rows[1]).toMatchObject({ tipo: "entrada", valor: 500, date: "2026-10-06" });
  });
  it("sem cabeçalho reconhecível não inventa lançamentos", () => {
    expect(parseStatement("foo,bar\n1,2")).toEqual([]);
    expect(guessCategory("coisa qualquer", "saida")).toBeNull();
  });
});

describe("chaves e duplicatas", () => {
  it("itens iguais no mesmo dia ganham chaves diferentes", () => {
    const r = { date: "2026-10-05", descricao: "Café", valor: 5, tipo: "saida" as const, categoria: null };
    const k = withKeys([r, r]);
    expect(k[0].key).not.toBe(k[1].key);
    expect(withKeys([r])[0].key).toBe(k[0].key);
  });
  it("importar duas vezes não duplica", async () => {
    const rows = [
      { date: "2026-10-05", descricao: "Café", valor: 5, tipo: "saida" as const, categoria: null },
      { date: "2026-10-05", descricao: "Café", valor: 5, tipo: "saida" as const, categoria: null },
      { date: "2026-10-06", descricao: "Pix cliente", valor: 100, tipo: "entrada" as const, categoria: "Receitas diversas" },
    ];
    expect(await commitStatement(rows, "pessoal")).toEqual({ imported: 3, skipped: 0 });
    expect(await commitStatement(rows, "pessoal")).toEqual({ imported: 0, skipped: 3 });
    expect((await previewStatement(rows)).every((r) => r.duplicate)).toBe(true);
    const all = await d.select().from(schema.transactions);
    expect(all).toHaveLength(3);
    expect(all.every((t) => t.scope === "pessoal" && t.status === "pago")).toBe(true);
  });
});
