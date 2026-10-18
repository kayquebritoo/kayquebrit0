import { describe, expect, it } from "vitest";
import { dayOffsetFor, isOptOutMessage, withOptOutFooter, OPT_OUT_FOOTER } from "../optout";

describe("isOptOutMessage", () => {
  it("reconhece só a mensagem inteira", () => {
    for (const m of ["SAIR", "sair", "Sair!", " parar ", "STOP", "Descadastrar", "não quero receber", "Nao quero mais receber."]) expect(isOptOutMessage(m)).toBe(true);
  });
  it("frase de conversa normal não descadastra", () => {
    for (const m of ["Pode sair daqui a pouco?", "vou parar o projeto de design", "cancelar a reunião", "oi", "", null, undefined]) expect(isOptOutMessage(m)).toBe(false);
  });
});

describe("withOptOutFooter", () => {
  it("acrescenta uma vez só", () => {
    const once = withOptOutFooter("Oi, tem promoção!");
    expect(once.endsWith(OPT_OUT_FOOTER)).toBe(true);
    expect(withOptOutFooter(once)).toBe(once);
  });
});

describe("dayOffsetFor (teto diário)", () => {
  it("o que passa do teto vai para os dias seguintes", () => {
    expect(dayOffsetFor(0, 80, 0)).toBe(0);
    expect(dayOffsetFor(79, 80, 0)).toBe(0);
    expect(dayOffsetFor(80, 80, 0)).toBe(1);
    expect(dayOffsetFor(160, 80, 0)).toBe(2);
  });
  it("desconta o que já saiu hoje", () => {
    expect(dayOffsetFor(19, 80, 60)).toBe(1);
    expect(dayOffsetFor(0, 80, 80)).toBe(1);
    expect(dayOffsetFor(19, 80, 40)).toBe(0);
  });
});
