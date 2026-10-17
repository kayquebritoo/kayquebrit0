import { describe, expect, it } from "vitest";
import { buildDemands, classifyDue, daysBetween, dayKey, greeting, monthCash, type TrxRow } from "../today";

const TZ = "America/Belem";
const TODAY = "2026-10-17";

describe("classifyDue", () => {
  it("atrasado, 48h, próximos dias e fora do quadro", () => {
    expect(classifyDue("2026-10-14", TODAY)).toEqual({ urgency: "late", daysLate: 3 });
    expect(classifyDue("2026-10-17", TODAY)).toEqual({ urgency: "soon", daysLate: 0 });
    expect(classifyDue("2026-10-19", TODAY)).toEqual({ urgency: "soon", daysLate: 0 });
    expect(classifyDue("2026-10-24", TODAY)).toEqual({ urgency: "upcoming", daysLate: 0 });
    expect(classifyDue("2026-10-25", TODAY)).toBeNull();
  });

  it("conta dias atravessando o mês", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("dayKey", () => {
  it("usa o fuso do estúdio, não UTC", () => {
    // 01:30 UTC do dia 18 ainda é dia 17 em Belém (UTC−3).
    expect(dayKey("2026-10-18T01:30:00Z", TZ)).toBe("2026-10-17");
  });
});

const trx = (over: Partial<TrxRow>): TrxRow => ({
  id: "t",
  tipo: "entrada",
  descricao: "Item",
  categoria: null,
  valor: "100",
  vencimento: "2026-10-10T15:00:00Z",
  status: "pendente",
  createdAt: "2026-10-01T15:00:00Z",
  ...over,
});

describe("buildDemands", () => {
  it("junta dinheiro, entregas e propostas, atrasados primeiro", () => {
    const list = buildDemands(
      {
        transactions: [
          trx({ id: "a", descricao: "Saldo entrega", vencimento: "2026-10-14T15:00:00Z" }),
          trx({ id: "b", tipo: "saida", descricao: "Hospedagem", vencimento: "2026-10-18T15:00:00Z" }),
          trx({ id: "c", status: "pago", vencimento: "2026-10-12T15:00:00Z" }),
        ],
        projects: [
          { id: "p1", titulo: "Site X", status: "producao", prazo: "2026-10-16T15:00:00Z" },
          { id: "p2", titulo: "Entregue", status: "entregue", prazo: "2026-10-10T15:00:00Z" },
        ],
        budgets: [
          {
            id: "b1",
            code: "#14002",
            title: "Plano Social",
            status: "draft",
            validUntil: "2026-10-22T15:00:00Z",
            totalAmount: "3000",
            clientName: "Natan Soares",
            clientCompany: "Pará Super Foods",
          },
        ],
      },
      TODAY,
      TZ
    );
    expect(list.map((d) => d.id)).toEqual(["trx-a", "prj-p1", "trx-b", "bud-b1"]);
    expect(list[0]).toMatchObject({ kind: "cobranca", urgency: "late", daysLate: 3 });
    expect(list[2]).toMatchObject({ kind: "pagamento", urgency: "soon" });
    expect(list[3]).toMatchObject({ kind: "proposta", detail: "Pará Super Foods", amount: 3000 });
  });
});

describe("monthCash", () => {
  it("soma só o que foi pago no mês e acumula o saldo por dia", () => {
    const c = monthCash(
      [
        trx({ id: "1", status: "pago", valor: "3000", vencimento: "2026-10-05T15:00:00Z" }),
        trx({ id: "2", status: "pago", tipo: "saida", valor: "120", vencimento: "2026-10-06T15:00:00Z" }),
        trx({ id: "3", status: "pendente", valor: "999", vencimento: "2026-10-07T15:00:00Z" }),
        trx({ id: "4", status: "pago", valor: "500", vencimento: "2026-09-30T15:00:00Z" }),
      ],
      TODAY,
      TZ
    );
    expect(c).toMatchObject({ monthKey: "2026-10", income: 3000, expense: 120, balance: 2880 });
    expect(c.series).toHaveLength(17);
    expect(c.series[4]).toBe(3000);
    expect(c.series.at(-1)).toBe(2880);
  });
});

describe("greeting", () => {
  it("varia com a hora local", () => {
    expect(greeting(new Date("2026-10-17T12:00:00Z"), TZ)).toBe("Bom dia");
    expect(greeting(new Date("2026-10-17T18:00:00Z"), TZ)).toBe("Boa tarde");
    expect(greeting(new Date("2026-10-17T23:00:00Z"), TZ)).toBe("Boa noite");
  });
});
