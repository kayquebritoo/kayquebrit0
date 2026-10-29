import { describe, expect, it } from "vitest";
import { COMPACT_STEP, compactState, showMore } from "../compact-list";

describe("listas compactas (5 · Ver mais +5 · Recolher)", () => {
  it("começa com 5 e informa quantos faltam", () => {
    const s = compactState(23, COMPACT_STEP);
    expect(s).toMatchObject({ visible: 5, remaining: 18, nextStep: 5, canMore: true, canCollapse: false });
  });

  it("Ver mais soma 5 sem passar do total", () => {
    expect(showMore(23, 5)).toBe(10);
    expect(showMore(23, 20)).toBe(23);
    expect(compactState(23, 20).nextStep).toBe(3);
  });

  it("no fim da lista não oferece Ver mais, só Recolher", () => {
    const s = compactState(12, 15);
    expect(s).toMatchObject({ visible: 12, remaining: 0, canMore: false, canCollapse: true });
  });

  it("lista curta não mostra controle nenhum", () => {
    expect(compactState(3, 5)).toMatchObject({ visible: 3, canMore: false, canCollapse: false });
    expect(compactState(5, 5)).toMatchObject({ visible: 5, canMore: false, canCollapse: false });
  });

  it("filtro que encolhe a lista limita o visível ao novo total", () => {
    expect(compactState(4, 20)).toMatchObject({ visible: 4, canMore: false, canCollapse: false });
    expect(compactState(8, 20)).toMatchObject({ visible: 8, canMore: false, canCollapse: true });
  });

  it("valores inválidos não quebram", () => {
    expect(compactState(0, 5).visible).toBe(0);
    expect(compactState(Number.NaN, Number.NaN).visible).toBe(0);
    expect(compactState(-3, 5).visible).toBe(0);
    expect(compactState(10, 0).visible).toBe(5);
  });
});
