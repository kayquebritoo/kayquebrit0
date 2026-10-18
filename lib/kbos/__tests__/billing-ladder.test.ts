import { describe, expect, it } from "vitest";
import { inSendWindow, ladderMessage, ladderStep } from "../billing-ladder";

describe("ladderStep", () => {
  it("1, 5 e 12 dias depois do vencimento", () => {
    expect(ladderStep("2026-10-10", "2026-10-11")).toBe(1);
    expect(ladderStep("2026-10-10", "2026-10-15")).toBe(2);
    expect(ladderStep("2026-10-10", "2026-10-22")).toBe(3);
  });
  it("nos outros dias não cobra", () => {
    for (const today of ["2026-10-10", "2026-10-12", "2026-10-16", "2026-10-23", "2026-10-09"]) expect(ladderStep("2026-10-10", today)).toBeNull();
  });
  it("atravessa a virada do mês", () => {
    expect(ladderStep("2026-10-25", "2026-11-06")).toBe(3);
  });
});

describe("inSendWindow (Belém, UTC-3)", () => {
  it("segunda 10h dentro; madrugada, noite e domingo fora", () => {
    expect(inSendWindow(new Date("2026-10-19T13:00:00Z"))).toBe(true); // seg 10h
    expect(inSendWindow(new Date("2026-10-19T03:05:00Z"))).toBe(false); // dom 00h05 em Belém
    expect(inSendWindow(new Date("2026-10-19T23:00:00Z"))).toBe(false); // seg 20h
    expect(inSendWindow(new Date("2026-10-18T15:00:00Z"))).toBe(false); // domingo 12h
  });
});

describe("ladderMessage", () => {
  const v = { nome: "Maria Souza", valor: "1500", servico: "Site Loja", vencimento: "2026-10-10", hoje: "2026-10-22" };
  it("usa primeiro nome, valor, data e prazo final", () => {
    const m1 = ladderMessage(1, v, "PIX");
    expect(m1).toContain("Oi, Maria!");
    expect(m1).toMatch(/R\$\s?1\.500,00/);
    expect(m1).toContain("(10/10)");
    expect(m1).toContain("PIX");
    expect(ladderMessage(3, v, "PIX")).toContain("até 24/10");
    expect(ladderMessage(2, v, "PIX")).toContain("venceu em 10/10");
  });
});
