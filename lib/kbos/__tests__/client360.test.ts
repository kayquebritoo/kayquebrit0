import { describe, expect, it } from "vitest";
import { buildSummary, buildTimeline, type Input } from "../client360";
import { frontOf } from "../fronts";

const NOW = new Date("2026-10-18T15:00:00Z");
const empty: Input = { deals: [], budgets: [], projects: [], transactions: [], tasks: [], conversations: [], cases: [] };

describe("frontOf", () => {
  it("junta as três listas antigas nas frentes", () => {
    expect(frontOf("fotografia")).toBe("imagem");
    expect(frontOf("Video")).toBe("imagem");
    expect(frontOf("audiovisual")).toBe("imagem");
    expect(frontOf("branding")).toBe("marca");
    expect(frontOf("design")).toBe("marca");
    expect(frontOf("site")).toBe("codigo");
    expect(frontOf("lojas")).toBe("codigo");
  });
  it("mensal e desconhecido ficam sem frente", () => {
    expect(frontOf("mensal")).toBeNull();
    expect(frontOf(null)).toBeNull();
  });
});

describe("ficha 360°", () => {
  const input: Input = {
    ...empty,
    budgets: [{ id: "b1", code: "#14002", title: "Plano Social", status: "sent", totalAmount: "3000", createdAt: "2026-10-17T12:00:00Z" }],
    projects: [
      { id: "p1", titulo: "Site", categoria: "sites", status: "producao", valor: "2500", prazo: null, createdAt: "2026-09-01T12:00:00Z" },
      { id: "p2", titulo: "Logo", categoria: "branding", status: "entregue", valor: "1200", prazo: null, createdAt: "2026-08-01T12:00:00Z" },
    ],
    transactions: [
      { id: "t1", tipo: "entrada", descricao: "Parcela 1", valor: "1000", status: "pago", vencimento: "2026-09-05T12:00:00Z", createdAt: "2026-09-06T12:00:00Z" },
      { id: "t2", tipo: "entrada", descricao: "Parcela 2", valor: "1500", status: "pendente", vencimento: "2026-10-05T12:00:00Z", createdAt: "2026-09-01T12:00:00Z" },
      { id: "t3", tipo: "entrada", descricao: "Parcela 3", valor: "500", status: "pendente", vencimento: "2026-11-05T12:00:00Z", createdAt: "2026-09-01T12:00:00Z" },
    ],
  };
  it("resume recebido, em aberto, atrasado e projetos por frente", () => {
    const s = buildSummary(input, NOW);
    expect(s.received).toBe(1000);
    expect(s.open).toBe(2000);
    expect(s.overdue).toBe(1500);
    expect(s.activeProjects).toBe(1);
    expect(s.openBudgets).toBe(1);
    expect(s.openBudgetsValue).toBe(3000);
    expect(s.byFront).toEqual({ codigo: 2500, marca: 1200 });
  });
  it("linha do tempo vem da mais nova para a mais antiga e marca atraso", () => {
    const t = buildTimeline(input, NOW);
    const ats = t.map((e) => e.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    expect(t.find((e) => e.id === "t-t2")?.tone).toBe("late");
    expect(t.find((e) => e.id === "t-t1")?.detail).toBe("Recebido");
  });
  it("cliente novo não quebra", () => {
    const s = buildSummary(empty, NOW);
    expect(s.firstContact).toBeNull();
    expect(buildTimeline(empty, NOW)).toEqual([]);
  });
});
