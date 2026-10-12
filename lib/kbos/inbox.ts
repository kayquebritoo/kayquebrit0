// Motor omnichannel — Fase 2 (Inbox Unificado).
//
// - Funções puras (testáveis sem I/O): normalização de evento, extração de
//   mensagem do payload `MESSAGES-UPSERT` da Evolution API, formatação de telefone.
// - Funções de banco: find-or-create de contato/conversa + ingestão idempotente.
// - Envio outbound via Evolution API (texto e mídia).
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { contacts, conversations, messages } from "./schema";
import { sendTelegramText } from "./telegram";

export type InboundMessage = {
  /** Identificador remoto do chat (ex. `5511999998888@s.whatsapp.net`). */
  chatId: string;
  /** Dígitos do telefone (null em grupos `@g.us` ou JIDs não numéricos). */
  phoneDigits: string | null;
  /** Nome de exibição vindo da rede. */
  pushName: string | null;
  /** True quando a mensagem partiu do próprio número (enviada pelo celular). */
  fromMe: boolean;
  /** Id da mensagem na rede (idempotência). */
  externalId: string | null;
  content: string | null;
  mediaUrl: string | null;
  messageType: "text" | "image" | "audio" | "document";
};

/** Normaliza o nome do evento (`MESSAGES-UPSERT`/`messages.upsert` → `messagesupsert`). */
export function normalizeEventName(event: unknown): string {
  return typeof event === "string" ? event.toLowerCase().replace(/[^a-z]/g, "") : "";
}

/** True quando o payload é um upsert de mensagens (inbound ou echo fromMe). */
export function isMessagesUpsert(event: unknown): boolean {
  return normalizeEventName(event) === "messagesupsert";
}

/** Extrai só dígitos de um JID/telefone (`+55 (11) 9...` → `55119...`). */
export function onlyDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

/** Formata dígitos BR p/ exibição (`5511999998888` → `+55 (11) 99999-8888`). */
export function phoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  return d ? `+${d}` : "";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Extrai a mensagem inbound do `data` de um `MESSAGES-UPSERT`.
 * Retorna null quando o payload deve ser ignorado (reaction, protocolo,
 * history-sync, grupo de status `@broadcast`, etc.).
 */
export function extractInbound(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const key = (d.key ?? {}) as Record<string, unknown>;
  let chatId = str(key.remoteJid);
  if (!chatId) return null;
  // JIDs `@lid` (identidade vinculada): não são o telefone — resolve pelo
  // `senderPn` (número real) para a conversa não duplicar/quebrar o vínculo.
  if (chatId.endsWith("@lid")) {
    const pn = str(d.senderPn);
    if (!pn) return null;
    chatId = pn.includes("@") ? pn : `${onlyDigits(pn)}@s.whatsapp.net`;
  }
  // Status do WhatsApp (`status@broadcast`) e newsletter: ignora.
  if (chatId === "status@broadcast" || chatId.endsWith("@newsletter")) return null;
  const fromMe = key.fromMe === true;
  const externalId = str(key.id);
  const pushName = str(d.pushName) ?? str(d.senderPn);
  const isGroup = chatId.endsWith("@g.us");
  const userPart = chatId.split("@")[0] ?? "";
  // Grupos: sem telefone individual — o chat vira a conversa, contato genérico.
  const digits = onlyDigits(userPart);
  const phoneDigits = !isGroup && digits.length >= 10 ? digits : null;

  const msg = (d.message ?? {}) as Record<string, unknown>;
  // Eventos de protocolo (revogação, history sync, receipts): ignora.
  if (msg.protocolMessage || msg.reactionMessage || msg.historySyncNotification) return null;

  const pickUrl = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    return str(r.url) ?? str(r.mediaUrl);
  };

  // Texto simples / citado.
  const conv = str(msg.conversation);
  const ext = msg.extendedTextMessage as Record<string, unknown> | undefined;
  if (conv || (ext && typeof ext === "object")) {
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: conv ?? str(ext?.text) ?? "",
      mediaUrl: null,
      messageType: "text",
    };
  }
  if (msg.imageMessage || msg.stickerMessage) {
    const inner = (msg.imageMessage ?? msg.stickerMessage) as Record<string, unknown>;
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: str(inner.caption) ?? (msg.stickerMessage ? "[figurinha]" : null),
      mediaUrl: pickUrl(inner),
      messageType: "image",
    };
  }
  if (msg.audioMessage) {
    const inner = msg.audioMessage as Record<string, unknown>;
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: null,
      mediaUrl: pickUrl(inner),
      messageType: "audio",
    };
  }
  if (msg.videoMessage) {
    const inner = msg.videoMessage as Record<string, unknown>;
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: str(inner.caption) ?? "[vídeo]",
      mediaUrl: pickUrl(inner),
      messageType: "document",
    };
  }
  if (msg.documentMessage) {
    const inner = msg.documentMessage as Record<string, unknown>;
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: str(inner.caption) ?? str(inner.fileName) ?? "[documento]",
      mediaUrl: pickUrl(inner),
      messageType: "document",
    };
  }
  if (msg.locationMessage || msg.liveLocationMessage) return null;
  if (msg.contactMessage) {
    const inner = msg.contactMessage as Record<string, unknown>;
    const name = str(inner.displayName);
    return {
      chatId,
      phoneDigits,
      pushName,
      fromMe,
      externalId,
      content: name ? `[contato: ${name}]` : "[contato]",
      mediaUrl: null,
      messageType: "text",
    };
  }
  if (msg.pollCreationMessage) {
    return { chatId, phoneDigits, pushName, fromMe, externalId, content: "[enquete]", mediaUrl: null, messageType: "text" };
  }
  // Tipo desconhecido sem texto aproveitável: ignora (evita ruído no inbox).
  return null;
}

/* ---------------- persistência (find-or-create + ingestão) ---------------- */

type Contact = typeof contacts.$inferSelect;
type Conversation = typeof conversations.$inferSelect;

/** Variações de um número p/ casar com telefones salvos em formatos diversos. */
export function phoneCandidates(digits: string): string[] {
  const d = digits.replace(/\D/g, "");
  if (!d) return [];
  const set = new Set<string>([d, `+${d}`]);
  if (d.length > 11) {
    const last11 = d.slice(-11);
    const last10 = d.slice(-10);
    set.add(last11);
    set.add(`+${last11}`);
    set.add(last10);
  }
  return [...set];
}

export async function findContactByPhone(digits: string): Promise<Contact | null> {
  const cands = phoneCandidates(digits);
  if (!cands.length) return null;
  const rows = await db().select().from(contacts).where(inArray(contacts.phone, cands)).limit(1);
  return rows[0] ?? null;
}

/** Localiza o contato pelo telefone ou cria um lead `via WhatsApp`. */
export async function findOrCreateContactForChat(inb: InboundMessage): Promise<Contact> {
  if (inb.phoneDigits) {
    const found = await findContactByPhone(inb.phoneDigits);
    if (found) return found;
    const rows = await db()
      .insert(contacts)
      .values({
        name: inb.pushName || phoneDisplay(inb.phoneDigits),
        phone: phoneDisplay(inb.phoneDigits),
        status: "lead",
        notes: "Criado automaticamente via WhatsApp (inbox).",
      })
      .returning();
    return rows[0];
  }
  // Grupos/redes sem telefone: contato genérico pelo nome da rede.
  const rows = await db()
    .insert(contacts)
    .values({
      name: inb.pushName || inb.chatId,
      status: "lead",
      notes: `Criado automaticamente via inbox (${inb.chatId}).`,
    })
    .returning();
  return rows[0];
}

export async function findConversation(channel: string, chatId: string): Promise<Conversation | null> {
  const rows = await db()
    .select()
    .from(conversations)
    .where(and(eq(conversations.channel, channel as "whatsapp"), eq(conversations.channelChatId, chatId)))
    .limit(1);
  return rows[0] ?? null;
}

export type IngestResult =
  | { ignored: true }
  | { ignored: false; deduped: boolean; conversation: Conversation; messageId: string };

/**
 * Ingestão completa de um inbound: contato → conversa (upsert) → mensagem.
 * Idempotente por `external_id`: reentregas retornam `{ deduped: true }`.
 */
export async function ingestInbound(
  channel: string,
  inb: InboundMessage
): Promise<IngestResult> {
  if (inb.externalId) {
    const dup = await db().select({ id: messages.id }).from(messages).where(eq(messages.externalId, inb.externalId)).limit(1);
    if (dup[0]) {
      const conv = await findConversation(channel, inb.chatId);
      if (!conv) return { ignored: true };
      return { ignored: false, deduped: true, conversation: conv, messageId: dup[0].id };
    }
  }
  const contact = await findOrCreateContactForChat(inb);
  const now = new Date();
  let conv = await findConversation(channel, inb.chatId);
  if (!conv) {
    const rows = await db()
      .insert(conversations)
      .values({
        contactId: contact.id,
        channel: channel as "whatsapp",
        channelChatId: inb.chatId,
        status: "open",
        unreadCount: inb.fromMe ? 0 : 1,
        lastMessageAt: now,
      })
      .returning();
    conv = rows[0];
  } else {
    const patch: Record<string, unknown> = { lastMessageAt: now, updatedAt: now };
    if (!conv.contactId) patch.contactId = contact.id;
    if (inb.fromMe) {
      patch.unreadCount = 0;
    } else {
      patch.unreadCount = (conv.unreadCount ?? 0) + 1;
      // Mensagem nova do cliente reabre conversa fechada.
      if (conv.status === "closed") patch.status = "open";
      else if (conv.status === "pending") patch.status = "open";
    }
    await db().update(conversations).set(patch).where(eq(conversations.id, conv.id));
    conv = { ...conv, ...(patch as Partial<Conversation>) };
  }
  const ins = await db()
    .insert(messages)
    .values({
      conversationId: conv.id,
      senderType: inb.fromMe ? "agent" : "customer",
      content: inb.content,
      mediaUrl: inb.mediaUrl,
      messageType: inb.messageType,
      status: "delivered",
      externalId: inb.externalId,
    })
    .returning({ id: messages.id });
  return { ignored: false, deduped: false, conversation: conv, messageId: ins[0].id };
}

/* ---------------- envio outbound via Evolution ---------------- */

function evoBase() {
  return (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
}

export function evoOutboundConfigured() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

async function evoPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${evoBase()}${path}`, {
    method: "POST",
    headers: { apikey: process.env.EVOLUTION_API_KEY || "", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Número discável p/ a Evolution a partir do `channel_chat_id` (só WhatsApp). */
export function chatIdToNumber(chatId: string): string | null {
  const user = chatId.split("@")[0] ?? "";
  const digits = onlyDigits(user);
  return digits.length >= 10 ? digits : null;
}

export type OutboundInput = { content?: string | null; mediaUrl?: string | null; messageType?: string };

/**
 * Envia pela Evolution (WhatsApp) ou Bot API (Telegram) e persiste como
 * `agent`. Demais canais → `501`. Lança erro quando o provedor não está
 * configurado ou a API falha — a rota traduz em 503/502.
 */
export async function sendAgentMessage(
  conv: Conversation,
  input: OutboundInput
): Promise<{ id: string; externalId: string | null }> {
  const text = input.content?.trim() || "";
  const type = input.messageType ?? (input.mediaUrl ? "image" : "text");

  if (conv.channel === "telegram") {
    if (input.mediaUrl) {
      throw new Error("Envio de mídia no Telegram ainda não suportado — envie texto.");
    }
    const { messageId } = await sendTelegramText(conv.channelChatId, text);
    return persistAgentMessage(conv, {
      content: text || null,
      mediaUrl: null,
      messageType: "text",
      externalId: messageId !== null ? `tg:${messageId}` : null,
    });
  }

  if (conv.channel !== "whatsapp") {
    const err = new Error(`Envio ainda não suportado no canal ${conv.channel}.`);
    (err as NodeJS.ErrnoException).code = "CHANNEL_UNSUPPORTED";
    throw err;
  }
  if (!evoOutboundConfigured()) {
    const err = new Error("Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE).");
    (err as NodeJS.ErrnoException).code = "EVOLUTION_MISCONFIGURED";
    throw err;
  }
  const number = chatIdToNumber(conv.channelChatId);
  if (!number) {
    const err = new Error("Chat sem número discável (grupo ou JID inválido).");
    (err as NodeJS.ErrnoException).code = "CHAT_NOT_DIALABLE";
    throw err;
  }
  const instance = process.env.EVOLUTION_INSTANCE || "kbos-primary";
  let externalId: string | null = null;
  if (input.mediaUrl) {
    const mediatype = type === "audio" ? "audio" : type === "document" ? "document" : "image";
    const r = await evoPost(`/message/sendMedia/${encodeURIComponent(instance)}`, {
      number,
      mediatype,
      media: input.mediaUrl,
      caption: text || undefined,
    });
    externalId = str((r.key as Record<string, unknown> | undefined)?.id) ?? null;
  } else {
    const r = await evoPost(`/message/sendText/${encodeURIComponent(instance)}`, { number, text });
    externalId = str((r.key as Record<string, unknown> | undefined)?.id) ?? null;
  }
  return persistAgentMessage(conv, {
    content: text || null,
    mediaUrl: input.mediaUrl || null,
    messageType: (type as "text" | "image" | "audio" | "document") ?? "text",
    externalId,
  });
}

async function persistAgentMessage(
  conv: Conversation,
  v: { content: string | null; mediaUrl: string | null; messageType: "text" | "image" | "audio" | "document"; externalId: string | null }
): Promise<{ id: string; externalId: string | null }> {
  const now = new Date();
  const ins = await db()
    .insert(messages)
    .values({
      conversationId: conv.id,
      senderType: "agent",
      content: v.content,
      mediaUrl: v.mediaUrl,
      messageType: v.messageType,
      status: "sent",
      externalId: v.externalId,
    })
    .returning({ id: messages.id });
  await db()
    .update(conversations)
    .set({ lastMessageAt: now, unreadCount: 0, updatedAt: now })
    .where(eq(conversations.id, conv.id));
  return { id: ins[0].id, externalId: v.externalId };
}
