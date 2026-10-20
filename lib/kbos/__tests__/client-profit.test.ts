import { describe, expect, it } from "vitest";
import { clientProfit, periodRange } from "../client-profit";

const T = (o: Partial<Parameters<typeof clientProfit>[0][number]>) => ({ tipo: "entrada", valor: 0, status: "pago", scope: "empresa", vencimento: "2026-10-10T12:00:00Z", createdAt: "2026-10-01T12:00:00Z", projectId: null, contactId: null, ...o });
const C = (id: string, name: string) => ({ id, name, company: null, status: "client" });

describe("clientProfit", () => {
  const projects = [{ id: "p1", contactId: "a" }, { id: "p2", contactId: "b" }];
  const contacts = [C("a", "Ana"), C("b", "Beto")];
  const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-31T23:59:59Z");

  it("receita paga − custos do projeto; ranking por lucro; pendente à parte", () => {
    const r = clientProfit([
      T({ valor: 1000, projectId: "p1" }), T({ tipo: "saida", valor: 200, projectId: "p1" }),
      T({ valor: 500, contactId: "b" }), T({ valor: 300, projectId: "p2", status: "pendente" }),
      T({ valor: 100 }), T({ tipo: "saida", valor: 50 }),
    ], projects, contacts, from, to);
    expect(r.rows.map((x) => [x.name, x.income, x.cost, x.profit, x.pending])).toEqual([["Ana", 1000, 200, 800, 0], ["Beto", 500, 0, 500, 300]]);
    expect(r.rows[0].margin).toBeCloseTo(0.8);
    expect(r.best?.name).toBe("Ana");
    expect(r.unassigned).toEqual({ income: 100, cost: 50, count: 2 });
    expect(r.totals.profit).toBe(1300);
  });
  it("respeita escopo e período e compara com o período anterior", () => {
    const r = clientProfit([
      T({ valor: 400, projectId: "p1", vencimento: "2026-09-15T12:00:00Z" }),
      T({ valor: 600, projectId: "p1" }), T({ valor: 999, projectId: "p1", scope: "pessoal" }),
      T({ valor: 999, projectId: "p1", vencimento: "2025-01-01T12:00:00Z" }),
    ], projects, contacts, from, to);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].profit).toBe(600);
    expect(r.rows[0].prevProfit).toBe(400);
    expect(r.rows[0].delta).toBeCloseTo(0.5);
  });
});

describe("periodRange", () => {
  it("mês e ano no horário de Belém", () => {
    const now = new Date("2026-10-20T04:00:00Z");
    expect(periodRange("mes", now).from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(periodRange("mes-passado", now).to.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    expect(periodRange("12m", now).from.toISOString()).toBe("2025-11-01T03:00:00.000Z");
    expect(periodRange("ano", now).label).toBe("2026");
  });
});
