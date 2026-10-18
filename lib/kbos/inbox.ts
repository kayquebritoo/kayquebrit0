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
import { evoConfig, warnEvoFallbackOnce } from "./evolution";
import { PublicError } from "./http";

export type InboundMessage = {
  /** Identificador remoto do chat (ex. `5511999998888@s.whatsapp.net` ou `…@g.us`). */
  chatId: string;
  /** Dígitos do telefone (null em grupos `@g.us` ou JIDs não numéricos). */
  phoneDigits: string | null;
  /** Nome de exibição de quem mandou (em grupo: o participante). */
  pushName: string | null;
  /** True quando a mensagem partiu do próprio número (enviada pelo celular). */
  fromMe: boolean;
  /** Id da mensagem na rede (idempotência e download da mídia). */
  externalId: string | null;
  content: string | null;
  mediaUrl: string | null;
  messageType: "text" | "image" | "audio" | "document" | "video";
  /** Grupo do WhatsApp: a conversa é o grupo, não quem escreveu. */
  isGroup: boolean;
  /** Telefone (dígitos) de quem escreveu no grupo, quando a rede informa. */
  senderPhone: string | null;
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

/** JID de telefone (`…@s.whatsapp.net`) → dígitos; `@lid` e afins → null. */
function pnDigits(jid: string | null): string | null {
  if (!jid || jid.includes("@lid") || jid.includes("@g.us")) return null;
  const d = onlyDigits(jid.split("@")[0]);
  return d.length >= 10 ? d : null;
}

/** Texto curto da última mensagem, para a lista do inbox. */
export function previewOf(m: Pick<InboundMessage, "content" | "messageType">): string {
  const label: Record<string, string> = { image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📎 Documento" };
  const text = (m.content || "").replace(/\s+/g, " ").trim();
  if (m.messageType === "text") return text.slice(0, 140);
  return text ? `${label[m.messageType] ?? ""} · ${text}`.slice(0, 140) : label[m.messageType] ?? "";
}

/**
 * Extrai a mensagem inbound do `data` de um `MESSAGES-UPSERT`.
 * Retorna null quando o payload deve ser ignorado (protocolo, history-sync,
 * status `@broadcast`, newsletter, reação removida etc.).
 */
export function extractInbound(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const key = (d.key ?? {}) as Record<string, unknown>;
  let chatId = str(key.remoteJid);
  if (!chatId) return null;
  // JIDs `@lid` (identidade vinculada) não são o telefone: usa o número real
  // (`remoteJidAlt` na v2.3, `senderPn` nas anteriores).
  if (chatId.endsWith("@lid")) {
    const pn = str(key.remoteJidAlt) ?? str(d.senderPn);
    if (!pn) return null;
    chatId = pn.includes("@") ? pn : `${onlyDigits(pn)}@s.whatsapp.net`;
  }
  if (chatId === "status@broadcast" || chatId.endsWith("@newsletter")) return null;
  const fromMe = key.fromMe === true;
  const externalId = str(key.id);
  const isGroup = chatId.endsWith("@g.us");
  const pushName = str(d.pushName) ?? (isGroup ? null : str(d.senderPn));
  const phoneDigits = isGroup ? null : pnDigits(chatId);
  const senderPhone = isGroup
    ? pnDigits(str(key.participantAlt) ?? str(key.participantPn) ?? str(key.participant))
    : phoneDigits;

  const msg = (d.message ?? {}) as Record<string, unknown>;
  if (msg.protocolMessage || msg.historySyncNotification || (msg.senderKeyDistributionMessage && Object.keys(msg).length === 1)) {
    return null;
  }

  const base = { chatId, phoneDigits, pushName, fromMe, externalId, isGroup, senderPhone };
  const pickUrl = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    return str(r.url) ?? str(r.mediaUrl);
  };
  const inner = (k: string) => msg[k] as Record<string, unknown> | undefined;

  // Reação (emoji num balão): vira uma linha curta no histórico.
  if (msg.reactionMessage) {
    const emoji = str(inner("reactionMessage")?.text);
    if (!emoji) return null; // reação removida
    return { ...base, content: `Reagiu com ${emoji}`, mediaUrl: null, messageType: "text" };
  }

  const conv = str(msg.conversation);
  const ext = inner("extendedTextMessage");
  if (conv || (ext && typeof ext === "object")) {
    return { ...base, content: conv ?? str(ext?.text) ?? "", mediaUrl: null, messageType: "text" };
  }
  if (msg.imageMessage || msg.stickerMessage) {
    const i = inner("imageMessage") ?? inner("stickerMessage") ?? {};
    return { ...base, content: str(i.caption), mediaUrl: pickUrl(i), messageType: "image" };
  }
  if (msg.audioMessage) {
    return { ...base, content: null, mediaUrl: pickUrl(inner("audioMessage")), messageType: "audio" };
  }
  if (msg.videoMessage || msg.ptvMessage) {
    const i = inner("videoMessage") ?? inner("ptvMessage") ?? {};
    return { ...base, content: str(i.caption), mediaUrl: pickUrl(i), messageType: "video" };
  }
  const doc = inner("documentMessage") ?? (inner("documentWithCaptionMessage")?.message as Record<string, unknown> | undefined)?.documentMessage as
    | Record<string, unknown>
    | undefined;
  if (doc) {
    return { ...base, content: str(doc.caption) ?? str(doc.fileName) ?? "Documento", mediaUrl: pickUrl(doc), messageType: "document" };
  }
  if (msg.locationMessage || msg.liveLocationMessage) {
    const l = inner("locationMessage") ?? inner("liveLocationMessage") ?? {};
    const lat = Number(l.degreesLatitude);
    const lng = Number(l.degreesLongitude);
    const link = Number.isFinite(lat) && Number.isFinite(lng) ? ` https://maps.google.com/?q=${lat},${lng}` : "";
    return { ...base, content: `📍 Localização${link}`, mediaUrl: null, messageType: "text" };
  }
  if (msg.contactMessage) {
    const name = str(inner("contactMessage")?.displayName);
    return { ...base, content: name ? `👤 Contato: ${name}` : "👤 Contato", mediaUrl: null, messageType: "text" };
  }
  const poll = inner("pollCreationMessage") ?? inner("pollCreationMessageV3");
  if (poll) {
    return { ...base, content: `📊 Enquete: ${str(poll.name) ?? ""}`.trim(), mediaUrl: null, messageType: "text" };
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

/** Localiza o contato pelo telefone ou cria um lead `via WhatsApp`. Grupos não viram contato. */
export async function findOrCreateContactForChat(inb: InboundMessage): Promise<Contact | null> {
  if (inb.isGroup || !inb.phoneDigits) return null;
  const found = await findContactByPhone(inb.phoneDigits);
  if (found) return found;
  const rows = await db()
    .insert(contacts)
    .values({
      // fromMe: o pushName é o meu, não o do contato.
      name: (!inb.fromMe && inb.pushName) || phoneDisplay(inb.phoneDigits),
      phone: phoneDisplay(inb.phoneDigits),
      status: "lead",
      source: "whatsapp",
      notes: "Criado automaticamente via WhatsApp (inbox).",
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

/** Nome do grupo na Evolution (best-effort, 4s). */
export async function fetchGroupSubject(groupJid: string): Promise<string | null> {
  try {
    const { url, key, instance } = evoConfig();
    const res = await fetch(
      `${url.replace(/\/$/, "")}/group/findGroupInfos/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
      { headers: { apikey: key }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return str(j.subject) ?? null;
  } catch {
    return null;
  }
}

export type IngestResult =
  | { ignored: true }
  | { ignored: false; deduped: boolean; conversation: Conversation; messageId: string };

/**
 * Ingestão completa de um inbound: contato (só conversa individual) →
 * conversa (upsert) → mensagem. Idempotente por `external_id`.
 */
export async function ingestInbound(channel: string, inb: InboundMessage): Promise<IngestResult> {
  if (inb.externalId) {
    const dup = await db().select({ id: messages.id }).from(messages).where(eq(messages.externalId, inb.externalId)).limit(1);
    if (dup[0]) {
      const conv = await findConversation(channel, inb.chatId);
      if (!conv) return { ignored: true };
      return { ignored: false, deduped: true, conversation: conv, messageId: dup[0].id };
    }
  }
  const now = new Date();
  const preview = previewOf(inb);
  let conv = await findConversation(channel, inb.chatId);
  if (!conv) {
    const contact = await findOrCreateContactForChat(inb);
    const title = inb.isGroup ? await fetchGroupSubject(inb.chatId) : null;
    const rows = await db()
      .insert(conversations)
      .values({
        contactId: contact?.id ?? null,
        channel: channel as "whatsapp",
        channelChatId: inb.chatId,
        status: "open",
        unreadCount: inb.fromMe ? 0 : 1,
        lastMessageAt: now,
        isGroup: inb.isGroup,
        title,
        lastPreview: preview,
      })
      .returning();
    conv = rows[0];
  } else {
    const patch: Record<string, unknown> = { lastMessageAt: now, updatedAt: now, lastPreview: preview };
    if (!conv.contactId && !inb.isGroup) {
      const contact = await findOrCreateContactForChat(inb);
      if (contact) patch.contactId = contact.id;
    }
    if (inb.isGroup && !conv.title) {
      const title = await fetchGroupSubject(inb.chatId);
      if (title) patch.title = title;
    }
    if (inb.isGroup && !conv.isGroup) patch.isGroup = true;
    if (inb.fromMe) {
      patch.unreadCount = 0;
    } else {
      patch.unreadCount = (conv.unreadCount ?? 0) + 1;
      // Mensagem nova do cliente reabre conversa fechada (grupos não reabrem).
      if (!inb.isGroup && (conv.status === "closed" || conv.status === "pending")) patch.status = "open";
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
      senderName: inb.fromMe ? null : inb.pushName,
      senderPhone: inb.fromMe ? null : inb.senderPhone,
    })
    .returning({ id: messages.id });
  return { ignored: false, deduped: false, conversation: conv, messageId: ins[0].id };
}

/** Baixa a mídia de uma mensagem recebida (a URL do WhatsApp é criptografada). */
export async function fetchInboundMedia(
  m: { externalId: string; chatId: string; fromMe: boolean; messageType: string }
): Promise<{ bytes: Buffer; mime: string } | null> {
  const { url, key, instance } = evoConfig();
  const res = await fetch(`${url.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { key: { id: m.externalId, remoteJid: m.chatId, fromMe: m.fromMe } }, convertToMp4: m.messageType === "video" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const b64 = str(j.base64);
  if (!b64) return null;
  return { bytes: Buffer.from(b64, "base64"), mime: str(j.mimetype) ?? "application/octet-stream" };
}

/* ---------------- envio outbound via Evolution ---------------- */

function evoBase() {
  return evoConfig().url.replace(/\/$/, "");
}

export function evoOutboundConfigured() {
  // Zero-config: sempre resolve (env ou padrões internos).
  const { url, key } = evoConfig();
  return !!(url && key);
}

async function evoPost(path: string, body: Record<string, unknown>) {
  warnEvoFallbackOnce();
  const res = await fetch(`${evoBase()}${path}`, {
    method: "POST",
    headers: { apikey: evoConfig().key, "Content-Type": "application/json" },
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
      throw new PublicError("Envio de mídia no Telegram ainda não suportado — envie texto.", 422);
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
  // Grupo: a Evolution aceita o próprio JID `…@g.us` como destino.
  const number = conv.channelChatId.endsWith("@g.us") ? conv.channelChatId : chatIdToNumber(conv.channelChatId);
  if (!number) {
    const err = new Error("Chat sem número discável (grupo ou JID inválido).");
    (err as NodeJS.ErrnoException).code = "CHAT_NOT_DIALABLE";
    throw err;
  }
  const instance = evoConfig().instance;
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
    messageType: (type as InboundMessage["messageType"]) ?? "text",
    externalId,
  });
}

async function persistAgentMessage(
  conv: Conversation,
  v: { content: string | null; mediaUrl: string | null; messageType: InboundMessage["messageType"]; externalId: string | null }
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
    .set({ lastMessageAt: now, unreadCount: 0, updatedAt: now, lastPreview: previewOf(v) })
    .where(eq(conversations.id, conv.id));
  return { id: ins[0].id, externalId: v.externalId };
}
