// Unitários da Fase 4 — financeiro (puros, sem I/O, client-safe).
import { describe, expect, it } from "vitest";
import { cashFlowByMonth, summarize, toDbInsert, toDbPatch, toFinanceEntry } from "../finance";

const row = (over: Record<string, unknown> = {}) => ({
  id: "1",
  tipo: "entrada",
  descricao: "Site",
  categoria: null,
  valor: "1000.00",
  vencimento: null,
  status: "pago",
  createdAt: "2026-01-05T10:00:00.000Z",
  ...over,
});

describe("toFinanceEntry", () => {
  it("mapeia PT→EN (entrada/pago)", () => {
    expect(toFinanceEntry(row())).toMatchObject({ type: "income", amount: 1000, status: "paid" });
  });
  it("saida/vencido → expense/overdue; pendente segue pending", () => {
    expect(toFinanceEntry(row({ tipo: "saida", status: "vencido", valor: "50" }))).toMatchObject({
      type: "expense",
      amount: 50,
      status: "overdue",
    });
    expect(toFinanceEntry(row({ status: "pendente" })).status).toBe("pending");
  });
});

describe("toDbInsert / toDbPatch", () => {
  it("EN→PT na escrita", () => {
    expect(
      toDbInsert({ type: "expense", description: "Aluguel", amount: "800", status: "pending" })
    ).toMatchObject({ tipo: "saida", descricao: "Aluguel", valor: "800", status: "pendente" });
  });
  it("patch parcial com updatedAt", () => {
    const p = toDbPatch({ status: "paid" });
    expect(p.status).toBe("pago");
    expect(p.updatedAt).toBeInstanceOf(Date);
    expect(toDbPatch({ type: "income" }).tipo).toBe("entrada");
  });
});

describe("summarize", () => {
  it("pagos compõem saldo; abertos vão p/ receber/pagar", () => {
    const s = summarize([
      { type: "income", amount: 1000, status: "paid" },
      { type: "expense", amount: 300, status: "paid" },
      { type: "income", amount: 500, status: "pending" },
      { type: "expense", amount: 200, status: "overdue" },
    ]);
    expect(s).toEqual({ income: 1000, expenses: 300, balance: 700, receivable: 500, payable: 200 });
  });
});

describe("cashFlowByMonth", () => {
  it("agrupa pagos por mês de vencimento; ignora pendentes", () => {
    const now = new Date(2026, 9, 11); // out/2026
    const pts = cashFlowByMonth(
      [
        { type: "income", amount: 100, status: "paid", dueDate: "2026-10-02T00:00:00Z", createdAt: "2026-10-01T00:00:00Z" },
        { type: "expense", amount: 40, status: "paid", dueDate: null, createdAt: "2026-09-15T00:00:00Z" },
        { type: "income", amount: 999, status: "pending", dueDate: "2026-10-03T00:00:00Z", createdAt: "2026-10-01T00:00:00Z" },
        { type: "income", amount: 5, status: "paid", dueDate: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" },
      ],
      2,
      now
    );
    expect(pts.map((p) => p.key)).toEqual(["2026-09", "2026-10"]);
    expect(pts[0]).toMatchObject({ income: 0, expenses: 40 });
    expect(pts[1]).toMatchObject({ income: 100, expenses: 0 });
  });
});
