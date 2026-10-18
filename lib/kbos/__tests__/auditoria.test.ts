// Auditoria out/2026: documento (CPF/CNPJ), dinheiro BR, inbox de grupos,
// recorrência e vencimento automático no financeiro.
import { describe, expect, it } from "vitest";
import { documentKind, formatDocument, isValidCNPJ, isValidCPF, maskDocumentInput } from "../document";
import { normalizeMoney, financeCreateSchema, contactCreateSchema } from "../validators";
import { extractInbound, previewOf } from "../inbox";
import { nextDueDate, toFinanceEntry } from "../finance";

describe("CPF/CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
  });
  it("aceita o CNPJ alfanumérico (2026)", () => {
    expect(isValidCNPJ("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCNPJ("12.ABC.345/01DE-34")).toBe(false);
  });
  it("tipo, formato e máscara", () => {
    expect(documentKind("52998224725")).toBe("pf");
    expect(documentKind("11222333000181")).toBe("pj");
    expect(documentKind("123")).toBeNull();
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(maskDocumentInput("5299822")).toBe("529.982.2");
    expect(maskDocumentInput("112223330001")).toBe("11.222.333/0001");
  });
  it("contato rejeita documento inválido e formata o válido", () => {
    expect(contactCreateSchema.safeParse({ name: "X", document: "11222333000180" }).success).toBe(false);
    const ok = contactCreateSchema.safeParse({ name: "X", document: "11222333000181" });
    expect(ok.success && ok.data.document).toBe("11.222.333/0001-81");
  });
});

describe("dinheiro no formato brasileiro", () => {
  it("normaliza", () => {
    expect(normalizeMoney("1.234,56")).toBe("1234.56");
    expect(normalizeMoney("R$ 100")).toBe("100");
    expect(normalizeMoney("100,5")).toBe("100.5");
    expect(normalizeMoney("1.500")).toBe("1500");
    expect(normalizeMoney("1234.56")).toBe("1234.56");
  });
  it("o lançamento aceita vírgula", () => {
    const r = financeCreateSchema.safeParse({ type: "expense", description: "Drive", amount: "1.234,56" });
    expect(r.success && r.data.amount).toBe("1234.56");
  });
});

const msg = (key: Record<string, unknown>, message: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  key: { id: "ID1", fromMe: false, ...key },
  pushName: "Ana",
  message,
  ...extra,
});

describe("inbox: grupos, reações e mídia", () => {
  it("grupo guarda o autor e não vira telefone", () => {
    const r = extractInbound(
      msg({ remoteJid: "120363@g.us", participant: "5591988887777@s.whatsapp.net" }, { conversation: "oi" })
    );
    expect(r).toMatchObject({ isGroup: true, phoneDigits: null, senderPhone: "5591988887777", pushName: "Ana" });
  });
  it("participante @lid usa participantAlt", () => {
    const r = extractInbound(
      msg({ remoteJid: "120363@g.us", participant: "999@lid", participantAlt: "5591911112222@s.whatsapp.net" }, { conversation: "x" })
    );
    expect(r?.senderPhone).toBe("5591911112222");
  });
  it("conversa @lid usa remoteJidAlt (v2.3)", () => {
    const r = extractInbound(msg({ remoteJid: "888@lid", remoteJidAlt: "5591933334444@s.whatsapp.net" }, { conversation: "x" }));
    expect(r?.chatId).toBe("5591933334444@s.whatsapp.net");
  });
  it("reação vira linha curta; remover reação é ignorado", () => {
    expect(extractInbound(msg({ remoteJid: "5591933334444@s.whatsapp.net" }, { reactionMessage: { text: "😂" } }))?.content).toBe(
      "Reagiu com 😂"
    );
    expect(extractInbound(msg({ remoteJid: "5591933334444@s.whatsapp.net" }, { reactionMessage: { text: "" } }))).toBeNull();
  });
  it("vídeo e figurinha", () => {
    expect(extractInbound(msg({ remoteJid: "5591933334444@s.whatsapp.net" }, { videoMessage: { url: "u" } }))?.messageType).toBe("video");
    expect(extractInbound(msg({ remoteJid: "5591933334444@s.whatsapp.net" }, { stickerMessage: { url: "u" } }))).toMatchObject({
      messageType: "image",
      content: null,
    });
  });
  it("prévia da lista", () => {
    expect(previewOf({ messageType: "image", content: null })).toBe("📷 Foto");
    expect(previewOf({ messageType: "text", content: "  oi\n tudo bem " })).toBe("oi tudo bem");
  });
});

describe("financeiro", () => {
  it("próximo vencimento mantém o dia e ajusta fim de mês", () => {
    expect(nextDueDate(new Date("2026-01-31T12:00:00Z"), "mensal").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(nextDueDate(new Date("2026-10-05T12:00:00Z"), "anual").toISOString().slice(0, 10)).toBe("2027-10-05");
  });
  it("pendente com data passada aparece como vencido", () => {
    const base = { id: "1", tipo: "saida", descricao: "x", categoria: null, valor: "10", status: "pendente", createdAt: "2026-10-01T00:00:00Z" };
    const now = new Date("2026-10-17T15:00:00Z");
    expect(toFinanceEntry({ ...base, vencimento: "2026-10-10T12:00:00Z" }, now).status).toBe("overdue");
    expect(toFinanceEntry({ ...base, vencimento: "2026-10-20T12:00:00Z" }, now).status).toBe("pending");
    expect(toFinanceEntry({ ...base, vencimento: null }, now).scope).toBe("empresa");
  });
});
