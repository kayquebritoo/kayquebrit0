// Canal Telegram (Bot API) — inbox omnichannel.
//
// Contrasta com o WhatsApp (Evolution): aqui basta UM token (`TELEGRAM_BOT_TOKEN`,
// criado com o @BotFather) — sem QR, sem sessão. O webhook (`/api/webhooks/telegram`)
// ingere via `ingestInbound("telegram", ...)` e o envio sai por `sendAgentMessage`.
// - Funções puras (testáveis sem rede): `parseTelegramUpdate`, `telegramChatId`.
// - Rede: `tgApi` genérico + `getMe`, `getWebhookInfo`, `setWebhook`, `deleteWebhook`,
//   `sendTelegramText`, `telegramFileUrl` (resolve `file_id` → URL https).
import type { InboundMessage } from "./inbox";
import { hostBaseFromRequest } from "./email";

export function tgToken(): string | null {
  const t = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return t || null;
}

export function tgConfigured(): boolean {
  return !!tgToken();
}

function tgBase(): string {
  return `https://api.telegram.org/bot${tgToken()}`;
}

export async function tgApi<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15000
): Promise<T> {
  const res = await fetch(`${tgBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  };
  if (!res.ok || json.ok !== true) {
    throw new Error(`Telegram ${method}: ${json.description || `HTTP ${res.status}`}`.slice(0, 300));
  }
  return json.result as T;
}

/** `tg:{chat_id}` — formato do `channel_chat_id` p/ Telegram. */
export function telegramChatId(chatId: number | string): string {
  return `tg:${chatId}`;
}

/** `tg:123` → `123` (id numérico p/ a Bot API). */
export function telegramChatNumeric(chat: string): number | null {
  const m = /^tg:(-?\d+)$/.exec(chat.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function displayName(from: Record<string, unknown>): string | null {
  const first = str(from.first_name);
  const last = str(from.last_name);
  const user = str(from.username);
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return user ? `@${user}` : null;
}

type TgFile = { file_id?: unknown; file_size?: unknown };

function biggestPhoto(photos: unknown): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  let best: string | null = null;
  let bestSize = -1;
  for (const p of photos) {
    const f = p as TgFile;
    const id = str(f.file_id);
    if (!id) continue;
    const size = typeof f.file_size === "number" ? f.file_size : 0;
    if (size >= bestSize) {
      bestSize = size;
      best = id;
    }
  }
  return best;
}

/**
 * Extrai mensagem inbound de um update do Telegram (`message` ou
 * `edited_message`). Mídia sai como `tgfile:{file_id}` e é resolvida p/
 * URL https em `resolveTelegramMedia` (webhook) — o parse puro não faz rede.
 * Retorna null p/ updates ignoráveis (service messages, polls, etc.).
 */
export function parseTelegramUpdate(update: unknown): InboundMessage | null {
  if (!update || typeof update !== "object") return null;
  const u = update as Record<string, unknown>;
  const msg = (u.message ?? u.edited_message) as Record<string, unknown> | undefined;
  if (!msg || typeof msg !== "object") return null;
  const chat = msg.chat as Record<string, unknown> | undefined;
  const from = (msg.from ?? {}) as Record<string, unknown>;
  const chatIdNum = typeof chat?.id === "number" ? chat.id : null;
  if (chatIdNum === null) return null;
  const messageId = typeof msg.message_id === "number" ? msg.message_id : null;
  const text = str(msg.text) ?? str(msg.caption);

  const photoId = biggestPhoto(msg.photo);
  if (photoId) {
    return {
      chatId: telegramChatId(chatIdNum),
      phoneDigits: null,
      pushName: displayName(from),
      isGroup: false,
      senderPhone: null,
      fromMe: false,
      externalId: messageId !== null ? `tg:${messageId}` : null,
      content: text,
      mediaUrl: `tgfile:${photoId}`,
      messageType: "image",
    };
  }
  const doc = msg.document as Record<string, unknown> | undefined;
  if (doc && typeof doc === "object" && str(doc.file_id)) {
    return {
      chatId: telegramChatId(chatIdNum),
      phoneDigits: null,
      pushName: displayName(from),
      isGroup: false,
      senderPhone: null,
      fromMe: false,
      externalId: messageId !== null ? `tg:${messageId}` : null,
      content: text ?? str(doc.file_name) ?? "[documento]",
      mediaUrl: `tgfile:${str(doc.file_id)}`,
      messageType: "document",
    };
  }
  const voice = (msg.voice ?? msg.audio) as Record<string, unknown> | undefined;
  if (voice && typeof voice === "object" && str(voice.file_id)) {
    return {
      chatId: telegramChatId(chatIdNum),
      phoneDigits: null,
      pushName: displayName(from),
      isGroup: false,
      senderPhone: null,
      fromMe: false,
      externalId: messageId !== null ? `tg:${messageId}` : null,
      content: null,
      mediaUrl: `tgfile:${str(voice.file_id)}`,
      messageType: "audio",
    };
  }
  if (text) {
    return {
      chatId: telegramChatId(chatIdNum),
      phoneDigits: null,
      pushName: displayName(from),
      isGroup: false,
      senderPhone: null,
      fromMe: false,
      externalId: messageId !== null ? `tg:${messageId}` : null,
      content: text,
      mediaUrl: null,
      messageType: "text",
    };
  }
  // stickers, locations, contacts, service messages: ignora sem ruído.
  return null;
}

/** Resolve `tgfile:{file_id}` → URL https direta (1 chamada getFile). */
export async function resolveTelegramMedia(mediaUrl: string | null): Promise<string | null> {
  if (!mediaUrl?.startsWith("tgfile:")) return mediaUrl;
  const fileId = mediaUrl.slice("tgfile:".length);
  if (!fileId) return null;
  const file = await tgApi<{ file_path?: string }>("getFile", { file_id: fileId });
  return file.file_path ? `https://api.telegram.org/file/bot${tgToken()}/${file.file_path}` : null;
}

/* ---------------- leitura de status / webhook ---------------- */

export type TgStatus = {
  configured: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  pendingUpdates: number | null;
  detail?: string;
};

export async function getTelegramStatus(): Promise<TgStatus> {
  if (!tgConfigured()) {
    return {
      configured: false,
      botUsername: null,
      webhookUrl: null,
      pendingUpdates: null,
      detail: "Defina TELEGRAM_BOT_TOKEN no ambiente (crie o bot com o @BotFather).",
    };
  }
  try {
    const [me, hook] = await Promise.all([
      tgApi<{ username?: string; first_name?: string }>("getMe"),
      tgApi<{ url?: string; pending_update_count?: number }>("getWebhookInfo"),
    ]);
    return {
      configured: true,
      botUsername: me.username ? `@${me.username}` : (me.first_name ?? null),
      webhookUrl: hook.url || null,
      pendingUpdates: typeof hook.pending_update_count === "number" ? hook.pending_update_count : null,
    };
  } catch (e) {
    return {
      configured: true,
      botUsername: null,
      webhookUrl: null,
      pendingUpdates: null,
      detail: e instanceof Error ? e.message : "Falha na Bot API.",
    };
  }
}

export function telegramWebhookUrl(req?: Request): string | null {
  // Backend canônico primeiro (APP_URL), senão a origem do request.
  const env = (process.env.APP_URL || "").replace(/\/$/, "");
  const base = env || hostBaseFromRequest(req);
  return base ? `${base}/api/webhooks/telegram` : null;
}

export async function connectTelegram(req?: Request): Promise<{ ok: boolean; detail?: string }> {
  const url = telegramWebhookUrl(req);
  if (!tgConfigured()) return { ok: false, detail: "TELEGRAM_BOT_TOKEN não configurado." };
  if (!url) return { ok: false, detail: "APP_URL não configurado (URL pública do webhook)." };
  try {
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
    await tgApi("setWebhook", {
      url,
      ...(secret.length >= 8 ? { secret_token: secret } : {}),
      allowed_updates: ["message", "edited_message"],
      drop_pending_updates: true,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Falha." };
  }
}

export async function disconnectTelegram(): Promise<{ ok: boolean; detail?: string }> {
  if (!tgConfigured()) return { ok: false, detail: "TELEGRAM_BOT_TOKEN não configurado." };
  try {
    await tgApi("deleteWebhook", { drop_pending_updates: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Falha." };
  }
}

/* ---------------- envio ---------------- */

export async function sendTelegramText(
  chat: string,
  text: string
): Promise<{ messageId: number | null }> {
  const numeric = telegramChatNumeric(chat);
  if (numeric === null) {
    const err = new Error("Chat Telegram inválido (esperado `tg:{chat_id}`).");
    (err as NodeJS.ErrnoException).code = "CHAT_NOT_DIALABLE";
    throw err;
  }
  if (!tgConfigured()) {
    const err = new Error("Telegram não configurado (TELEGRAM_BOT_TOKEN).");
    (err as NodeJS.ErrnoException).code = "TELEGRAM_MISCONFIGURED";
    throw err;
  }
  const r = await tgApi<{ message_id?: number }>("sendMessage", {
    chat_id: numeric,
    text: text.slice(0, 4000),
  });
  return { messageId: typeof r.message_id === "number" ? r.message_id : null };
}
