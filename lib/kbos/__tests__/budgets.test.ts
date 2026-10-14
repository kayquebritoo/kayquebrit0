// Unitários de orçamentos (puros, sem I/O, client-safe).
import { describe, expect, it } from "vitest";
import {
  budgetTotal,
  calcBudgetTotals,
  calcBudgetWithDiscount,
  calcDiscountAmount,
  looksLikeBudgetCommand,
  parseBudgetCommand,
  parseMoney,
} from "../budgets";

describe("calcBudgetTotals", () => {
  it("recalcula linha e total geral", () => {
    const { items, total } = calcBudgetTotals([
      { service: "Site", quantity: 1, unitPrice: 3000, total: 0 },
      { service: "Blog", quantity: 2, unitPrice: 400, total: 999 },
    ]);
    expect(items[0].total).toBe(3000);
    expect(items[1].total).toBe(800);
    expect(total).toBe(3800);
    expect(budgetTotal(items)).toBe(3800);
  });

  it("zera quantidades/preços inválidos", () => {
    const { total } = calcBudgetTotals([
      { service: "X", quantity: NaN, unitPrice: -5, total: 10 },
    ]);
    expect(total).toBe(0);
  });
});

describe("calcBudgetWithDiscount", () => {
  const items = [
    { service: "Cobertura", quantity: 4, unitPrice: 1500, total: 0 },
  ];
  it("sem desconto o total é o subtotal", () => {
    const r = calcBudgetWithDiscount(items, "fixed", 0);
    expect(r.subtotal).toBe(6000);
    expect(r.discountAmount).toBe(0);
    expect(r.total).toBe(6000);
  });
  it("desconto fixo em R$ abate do subtotal", () => {
    const r = calcBudgetWithDiscount(items, "fixed", 500);
    expect(r.discountAmount).toBe(500);
    expect(r.total).toBe(5500);
  });
  it("desconto percentual calcula sobre o subtotal", () => {
    const r = calcBudgetWithDiscount(items, "percent", 10);
    expect(r.discountAmount).toBe(600);
    expect(r.total).toBe(5400);
  });
  it("trava desconto acima do subtotal / acima de 100%", () => {
    expect(calcDiscountAmount(1000, "fixed", 5000)).toBe(1000);
    expect(calcDiscountAmount(1000, "percent", 150)).toBe(1000);
    expect(calcBudgetWithDiscount(items, "percent", 200).total).toBe(0);
  });
});

describe("parseMoney", () => {
  it("entende formatos pt-BR e atalhos", () => {
    expect(parseMoney("3000")).toBe(3000);
    expect(parseMoney("R$ 1.200,50")).toBe(1200.5);
    expect(parseMoney("3 mil")).toBe(3000);
    expect(parseMoney("2.5k")).toBe(2500);
    expect(parseMoney("zero")).toBeNull();
  });
});

describe("parseBudgetCommand", () => {
  it("extrai título, cliente e itens com valores", () => {
    const p = parseBudgetCommand("criar orçamento site para Maria: página inicial 3000, blog 800");
    expect(p).not.toBeNull();
    expect(p?.clientName).toMatch(/Maria/i);
    expect(p?.items).toHaveLength(2);
    expect(p?.items[0]).toMatchObject({ service: expect.stringContaining("gina"), unitPrice: 3000 });
  });

  it("ignora texto sem intenção de orçamento", () => {
    expect(looksLikeBudgetCommand("qual o prazo do projeto?")).toBe(false);
    expect(parseBudgetCommand("qual o prazo do projeto?")).toBeNull();
  });

  it("comando sem valores pede complemento (null)", () => {
    expect(parseBudgetCommand("criar orçamento para João")).toBeNull();
  });
});
