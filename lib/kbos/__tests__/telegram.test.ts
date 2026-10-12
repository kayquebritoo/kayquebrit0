// Unitários dos canais Telegram (puros, sem rede).
import { describe, expect, it } from "vitest";
import {
  parseTelegramUpdate,
  telegramChatId,
  telegramChatNumeric,
} from "../telegram";

const msg = (over: Record<string, unknown> = {}) => ({
  update_id: 1,
  message: {
    message_id: 42,
    chat: { id: 987654321, type: "private" },
    from: { first_name: "Ana", last_name: "Souza", username: "anasz" },
    text: "Olá!",
    ...over,
  },
});

describe("telegramChatId / telegramChatNumeric", () => {
  it("formata e extrai o id numérico", () => {
    expect(telegramChatId(987654321)).toBe("tg:987654321");
    expect(telegramChatNumeric("tg:987654321")).toBe(987654321);
    expect(telegramChatNumeric("tg:-100123")).toBe(-100123);
  });
  it("null p/ formato inválido", () => {
    expect(telegramChatNumeric("5511999998888@s.whatsapp.net")).toBeNull();
    expect(telegramChatNumeric("tg:abc")).toBeNull();
    expect(telegramChatNumeric("")).toBeNull();
  });
});

describe("parseTelegramUpdate", () => {
  it("texto com nome + idempotência tg:{message_id}", () => {
    const r = parseTelegramUpdate(msg());
    expect(r).toMatchObject({
      chatId: "tg:987654321",
      phoneDigits: null,
      pushName: "Ana Souza",
      fromMe: false,
      externalId: "tg:42",
      content: "Olá!",
      messageType: "text",
    });
  });
  it("username vira @ quando sem nome", () => {
    const r = parseTelegramUpdate(msg());
    expect(r?.pushName).toBe("Ana Souza");
    const r2 = parseTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 43,
        chat: { id: 1 },
        from: { username: "fulano" },
        text: "oi",
      },
    });
    expect(r2?.pushName).toBe("@fulano");
  });
  it("foto pega a maior + legenda", () => {
    const r = parseTelegramUpdate(
      msg({
        text: undefined,
        caption: "olha",
        photo: [
          { file_id: "small", file_size: 100 },
          { file_id: "big", file_size: 9000 },
        ],
      })
    );
    expect(r).toMatchObject({ messageType: "image", mediaUrl: "tgfile:big", content: "olha" });
  });
  it("documento e áudio", () => {
    const d = parseTelegramUpdate(
      msg({ text: undefined, document: { file_id: "doc1", file_name: "orc.pdf" } })
    );
    expect(d).toMatchObject({ messageType: "document", mediaUrl: "tgfile:doc1" });
    const a = parseTelegramUpdate(msg({ text: undefined, voice: { file_id: "v1" } }));
    expect(a).toMatchObject({ messageType: "audio", mediaUrl: "tgfile:v1" });
  });
  it("edited_message também ingere", () => {
    const r = parseTelegramUpdate({
      update_id: 3,
      edited_message: {
        message_id: 44,
        chat: { id: 5 },
        from: { first_name: "B" },
        text: "corrigido",
      },
    });
    expect(r?.content).toBe("corrigido");
  });
  it("null p/ sticker, service e payload vazio", () => {
    expect(parseTelegramUpdate(msg({ text: undefined, sticker: { file_id: "s" } }))).toBeNull();
    expect(parseTelegramUpdate({ update_id: 9 })).toBeNull();
    expect(parseTelegramUpdate(null)).toBeNull();
  });
});
