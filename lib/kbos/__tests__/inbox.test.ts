// Unitários da Fase 2 — parsing omnichannel (puros, sem I/O nem rede).
import { describe, expect, it } from "vitest";
import {
  chatIdToNumber,
  extractInbound,
  isMessagesUpsert,
  normalizeEventName,
  onlyDigits,
  phoneCandidates,
  phoneDisplay,
} from "../inbox";

describe("normalizeEventName / isMessagesUpsert", () => {
  it("aceita as variações da Evolution", () => {
    expect(isMessagesUpsert("MESSAGES-UPSERT")).toBe(true);
    expect(isMessagesUpsert("messages.upsert")).toBe(true);
    expect(isMessagesUpsert("messages_upsert")).toBe(true);
    expect(normalizeEventName("MESSAGES-UPSERT")).toBe("messagesupsert");
  });
  it("rejeita outros eventos e lixo", () => {
    expect(isMessagesUpsert("CONNECTION-UPDATE")).toBe(false);
    expect(isMessagesUpsert("send.message.update")).toBe(false);
    expect(isMessagesUpsert(null)).toBe(false);
    expect(isMessagesUpsert(123)).toBe(false);
  });
});

describe("onlyDigits / phoneDisplay", () => {
  it("extrai dígitos", () => {
    expect(onlyDigits("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(onlyDigits(null)).toBe("");
  });
  it("formata BR", () => {
    expect(phoneDisplay("5511999998888")).toBe("+55 (11) 99999-8888");
    expect(phoneDisplay("5511988887777")).toBe("+55 (11) 98888-7777");
  });
  it("fallback internacional", () => {
    expect(phoneDisplay("12125551234")).toBe("+12125551234");
  });
});

describe("phoneCandidates", () => {
  it("gera variações p/ casar formatos diversos", () => {
    const c = phoneCandidates("5511999998888");
    expect(c).toContain("5511999998888");
    expect(c).toContain("+5511999998888");
    expect(c).toContain("11999998888");
  });
  it("vazio p/ entrada inválida", () => {
    expect(phoneCandidates("")).toEqual([]);
  });
});

const base = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: false, id: "3EB0ABC" },
  pushName: "Fulana",
  message,
  ...extra,
});

describe("extractInbound", () => {
  it("texto simples (conversation)", () => {
    const r = extractInbound(base({ conversation: "Olá!" }));
    expect(r).toMatchObject({
      chatId: "5511999998888@s.whatsapp.net",
      phoneDigits: "5511999998888",
      pushName: "Fulana",
      fromMe: false,
      externalId: "3EB0ABC",
      content: "Olá!",
      messageType: "text",
    });
  });
  it("texto estendido", () => {
    const r = extractInbound(base({ extendedTextMessage: { text: "citado" } }));
    expect(r?.content).toBe("citado");
    expect(r?.messageType).toBe("text");
  });
  it("imagem com legenda + url", () => {
    const r = extractInbound(base({ imageMessage: { caption: "foto", url: "https://x/y.jpg" } }));
    expect(r).toMatchObject({ messageType: "image", content: "foto", mediaUrl: "https://x/y.jpg" });
  });
  it("áudio", () => {
    const r = extractInbound(base({ audioMessage: { url: "https://x/a.ogg" } }));
    expect(r).toMatchObject({ messageType: "audio", mediaUrl: "https://x/a.ogg" });
  });
  it("documento", () => {
    const r = extractInbound(base({ documentMessage: { fileName: "orc.pdf", url: "https://x/d" } }));
    expect(r).toMatchObject({ messageType: "document", mediaUrl: "https://x/d" });
  });
  it("fromMe vira echo do agente", () => {
    const r = extractInbound({
      key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: true, id: "X" },
      pushName: "Eu",
      message: { conversation: "oi" },
    });
    expect(r?.fromMe).toBe(true);
  });
  it("grupo @g.us: sem telefone, chat preservado", () => {
    const r = extractInbound({
      key: { remoteJid: "55119-999@g.us", fromMe: false, id: "G" },
      pushName: "Grupo",
      message: { conversation: "oi grupo" },
    });
    expect(r?.phoneDigits).toBeNull();
    expect(r?.chatId).toBe("55119-999@g.us");
  });
  it("JID @lid: resolve o telefone via senderPn", () => {
    const r = extractInbound({
      key: { remoteJid: "123456789012345@lid", fromMe: false, id: "L" },
      pushName: "Ciclana",
      senderPn: "5511988887777@s.whatsapp.net",
      message: { conversation: "oi via lid" },
    });
    expect(r?.chatId).toBe("5511988887777@s.whatsapp.net");
    expect(r?.phoneDigits).toBe("5511988887777");
  });
  it("JID @lid sem senderPn: ignora (sem vínculo confiável)", () => {
    const r = extractInbound({
      key: { remoteJid: "123456789012345@lid", fromMe: false, id: "L2" },
      pushName: "Sem fone",
      message: { conversation: "oi" },
    });
    expect(r).toBeNull();
  });
  it("ignora protocolo, reaction e status@broadcast", () => {
    expect(extractInbound(base({ protocolMessage: {} }))).toBeNull();
    expect(extractInbound(base({ reactionMessage: {} }))).toBeNull();
    expect(
      extractInbound({
        key: { remoteJid: "status@broadcast", fromMe: false, id: "S" },
        message: { conversation: "x" },
      })
    ).toBeNull();
  });
  it("null p/ payload sem remoteJid ou vazio", () => {
    expect(extractInbound({ key: {}, message: {} })).toBeNull();
    expect(extractInbound(null)).toBeNull();
    expect(extractInbound({})).toBeNull();
  });
});

describe("chatIdToNumber", () => {
  it("JID → dígitos discáveis", () => {
    expect(chatIdToNumber("5511999998888@s.whatsapp.net")).toBe("5511999998888");
  });
  it("null p/ grupo ou JID curto", () => {
    expect(chatIdToNumber("123@g.us")).toBeNull();
    expect(chatIdToNumber("abc")).toBeNull();
  });
});
