import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { ingestInbound, isMessagesUpsert } from "@/lib/kbos/inbox";
import { parseTelegramUpdate, resolveTelegramMedia } from "@/lib/kbos/telegram";
import { serverError } from "@/lib/kbos/http";

// Webhook inbound do Telegram (Bot API) — PÚBLICO (o Telegram não tem cookie
// de sessão; o proxy não exige auth em `/api/webhooks/*`).
//
// Conexão: `POST /api/channels/telegram {action:"connect"}` registra este URL
// via setWebhook. Segurança opcional: `TELEGRAM_WEBHOOK_SECRET` (≥8 chars) —
// quando definido, o Telegram o reenvia no header
// `X-Telegram-Bot-Api-Secret-Token` e divergências dão 401.
// Idempotência: `ingestInbound` deduplica por `external_id` (`tg:{message_id}`).
function checkSecret(req: Request): boolean {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (secret.length < 8) return true;
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  return got.length === secret.length && got === secret;
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "webhooks:evolution");
  if (limited) return limited;
  if (!checkSecret(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }
  // Guarda: se um dia a Evolution postar aqui por engano, ignora sem 500.
  if (body && typeof body === "object" && "event" in body && isMessagesUpsert((body as Record<string, unknown>).event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const inb = parseTelegramUpdate(body);
  if (!inb) return NextResponse.json({ ok: true, ignored: true });
  try {
    if (inb.mediaUrl) inb.mediaUrl = await resolveTelegramMedia(inb.mediaUrl);
    const r = await ingestInbound("telegram", inb);
    if (r.ignored) return NextResponse.json({ ok: true, ignored: true });
    return NextResponse.json({
      ok: true,
      deduped: r.deduped,
      conversationId: r.conversation.id,
      messageId: r.messageId,
    });
  } catch (e) {
    // 500 = o Telegram retenta depois; a ingestão idempotente evita duplicatas.
    return serverError(e);
  }
}

// GET de verificação manual (abre no navegador p/ conferir deploy + segredo).
export async function GET() {
  const protected_ = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim().length >= 8;
  return NextResponse.json({ ok: true, webhook: "telegram", secret: protected_ ? "on" : "off" });
}
