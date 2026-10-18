import { describe, expect, it } from "vitest";
import { deliveredAskMessage, followupMessage, followupStep } from "../relationship";

describe("followupStep", () => {
  it("janelas de 3-7 e 10-14 dias; fora delas não manda", () => {
    expect([0, 2].map(followupStep)).toEqual([null, null]);
    expect([3, 5, 7].map(followupStep)).toEqual([1, 1, 1]);
    expect([8, 9].map(followupStep)).toEqual([null, null]);
    expect([10, 14].map(followupStep)).toEqual([2, 2]);
    expect([15, 40].map(followupStep)).toEqual([null, null]);
  });
});

describe("mensagens", () => {
  it("follow-up usa primeiro nome, código e validade", () => {
    expect(followupMessage(1, { nome: "Ana Lima", codigo: "#14002" })).toContain("Oi, Ana!");
    expect(followupMessage(2, { nome: "Ana Lima", codigo: "#14002", validade: "2026-10-27" })).toContain("válida até 27/10/2026");
    expect(followupMessage(2, { nome: "Ana", codigo: "#1" })).toContain("segue válida.");
  });
  it("pedido pós-entrega promete aprovação antes de publicar", () => {
    const m = deliveredAskMessage({ nome: "Bruno Souza", servico: "Site Loja" });
    expect(m).toContain("Oi, Bruno!");
    expect(m).toContain("Site Loja");
    expect(m).toContain("nada vai ao ar sem o seu ok");
  });
});
