import { describe, expect, it } from "vitest";
import { forecast, meiStatus, monthResult, projectProfit, type Proj, type Trx } from "../reports";

const t = (o: Partial<Trx>): Trx => ({ tipo: "entrada", valor: "100", status: "pago", scope: "empresa", categoria: null, vencimento: "2026-10-10T12:00:00Z", createdAt: "2026-10-01T12:00:00Z", projectId: null, ...o });
const projs: Proj[] = [
  { id: "p1", titulo: "Site X", categoria: "sites", valor: "3000" },
  { id: "p2", titulo: "Logo Y", categoria: "branding", valor: "1000" },
];
const NOW = new Date("2026-10-18T15:00:00Z");

describe("monthResult", () => {
  const trx = [
    t({ valor: "1000", projectId: "p1", categoria: "Site" }),
    t({ valor: "500", projectId: "p2" }),
    t({ tipo: "saida", valor: "200", categoria: "Software" }),
    t({ tipo: "saida", valor: "999", scope: "pessoal" }),
    t({ valor: "700", status: "pendente" }),
    t({ valor: "50", vencimento: "2026-09-10T12:00:00Z" }),
  ];
  it("separa empresa de pessoal e soma só o pago", () => {
    const r = monthResult(trx, projs, "2026-10", "empresa");
    expect(r.income).toBe(1500);
    expect(r.expense).toBe(200);
    expect(r.result).toBe(1300);
    expect(r.pendingIncome).toBe(700);
    expect(r.byFront).toEqual({ codigo: 1000, marca: 500 });
  });
  it("tudo soma os dois lados", () => {
    expect(monthResult(trx, projs, "2026-10", "tudo").expense).toBe(1199);
  });
});

describe("projectProfit", () => {
  it("calcula líquido e R$/hora só com horas registradas", () => {
    const trx = [t({ valor: "3000", projectId: "p1" }), t({ tipo: "saida", valor: "500", projectId: "p1" }), t({ valor: "1000", projectId: "p2" })];
    const r = projectProfit(trx, projs, { p1: 50 * 3600 });
    const p1 = r.find((x) => x.id === "p1")!;
    expect(p1.net).toBe(2500);
    expect(p1.perHour).toBe(50);
    expect(r.find((x) => x.id === "p2")!.perHour).toBeNull();
  });
});

describe("forecast", () => {
  it("janelas de 30/60/90 e atrasados à parte", () => {
    const trx = [
      t({ status: "pendente", valor: "1000", vencimento: "2026-10-25T12:00:00Z" }),
      t({ status: "pendente", valor: "400", tipo: "saida", vencimento: "2026-11-30T12:00:00Z" }),
      t({ status: "pendente", valor: "800", vencimento: "2026-12-30T12:00:00Z" }),
      t({ status: "pendente", valor: "300", vencimento: "2026-10-01T12:00:00Z" }),
    ];
    const [a, b, c] = forecast(trx, "empresa", NOW);
    expect(a.income).toBe(1000);
    expect(b.expense).toBe(400);
    expect(c.income).toBe(1800);
    expect(a.late).toBe(300);
  });
});

describe("meiStatus", () => {
  const rev = (v: number) => [t({ valor: String(v) })];
  it("níveis em relação ao teto de R$ 81 mil", () => {
    expect(meiStatus(rev(30_000), NOW).level).toBe("ok");
    expect(meiStatus(rev(66_000), NOW).level).toBe("atencao");
    expect(meiStatus(rev(75_000), NOW).level).toBe("perigo");
    expect(meiStatus(rev(90_000), NOW).level).toBe("excedeu");
    expect(meiStatus(rev(100_000), NOW).level).toBe("desenquadra");
  });
  it("ignora pessoal, pendente e outros anos", () => {
    const trx = [t({ valor: "5000", scope: "pessoal" }), t({ valor: "5000", status: "pendente" }), t({ valor: "5000", vencimento: "2025-10-10T12:00:00Z" }), t({ valor: "1000" })];
    expect(meiStatus(trx, NOW).revenue).toBe(1000);
  });
});
