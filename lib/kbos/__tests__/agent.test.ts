import { describe, expect, it } from "vitest";
import { describeAction, isAgentMessage, isNo, isYes, samePhone } from "../agent";
import type { InboundMessage } from "../inbox";

const msg = (o: Partial<InboundMessage>): InboundMessage => ({
  chatId: "5591993743109@s.whatsapp.net",
  phoneDigits: "5591993743109",
  pushName: "Kayque",
  fromMe: true,
  externalId: "X1",
  content: "lança uma despesa",
  mediaUrl: null,
  messageType: "text",
  isGroup: false,
  senderPhone: "5591993743109",
  ...o,
});

describe("agente", () => {
  it("reconhece o mesmo número com ou sem 55 e 9º dígito", () => {
    expect(samePhone("559193743109", "5591993743109")).toBe(true);
    expect(samePhone("91993743109", "5591993743109")).toBe(true);
    expect(samePhone("5591988887777", "5591993743109")).toBe(false);
  });
  it("só age com dono + token; ignora grupos, clientes e o próprio eco", () => {
    const owner = "5591993743109";
    expect(isAgentMessage(msg({}), owner, true)).toBe(true);
    expect(isAgentMessage(msg({}), owner, false)).toBe(false);
    expect(isAgentMessage(msg({ isGroup: true, phoneDigits: null }), owner, true)).toBe(false);
    expect(isAgentMessage(msg({ phoneDigits: "5591988887777" }), owner, true)).toBe(false);
    expect(isAgentMessage(msg({ content: "🤖 Lançado." }), owner, true)).toBe(false);
    expect(isAgentMessage(msg({ messageType: "image" }), owner, true)).toBe(false);
  });
  it("entende sim e não", () => {
    expect(isYes("Sim, pode")).toBe(true);
    expect(isYes("ok")).toBe(true);
    expect(isNo("não")).toBe(true);
    expect(isNo("cancela")).toBe(true);
    expect(isYes("simulação")).toBe(false);
  });
  it("resume a ação antes de gravar", () => {
    expect(
      describeAction({ tool: "lancar_financeiro", args: { tipo: "saida", descricao: "Claude Code", valor: 120, conta: "empresa", recorrencia: "mensal", pago: true } })
    ).toContain("R$ 120,00");
    expect(describeAction({ tool: "criar_tarefa", args: { titulo: "Roteiro", prazo: "2026-10-20" } })).toContain("20/10");
  });
});
