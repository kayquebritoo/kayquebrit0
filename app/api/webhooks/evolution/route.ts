import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { messages } from "@/lib/kbos/schema";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import {
  extractInbound,
  ingestInbound,
  isMessagesUpsert,
  normalizeEventName,
} from "@/lib/kbos/inbox";

// Webhook inbound da Evolution API — PÚBLICO (a Evolution não tem cookie de
// sessão; o middleware não exige auth em `/api/webhooks/*`).
//
// Configurado SOZINHO pelo app (`ensureInstance`/`setInstanceWebhook` ao abrir
// /admin/whatsapp): URL `https://<APP_URL>/api/webhooks/evolution` (+ `?token=`
/// quando `EVOLUTION_WEBHOOK_TOKEN` ≥8 chars), eventos `MESSAGES_UPSERT`,
// `MESSAGES_UPDATE` e `SEND_MESSAGE_UPDATE`.
// Segurança opcional: defina `EVOLUTION_WEBHOOK_TOKEN` (≥8 chars) e repita o
// valor em `?token=` ou no header `x-webhook-token` na config do webhook.
// Sem o token configurado, aceita qualquer origem (fail-open documentado,
// como os demais webhooks do projeto) — o rate-limit segue valendo.
//
// Idempotência: `ingestInbound` deduplica por `external_id`, então reentregas
// da Evolution retornam `{ deduped: true }` sem duplicar linhas.
function checkSecret(req: Request): boolean {
  const token = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim();
  if (token.length < 8) return true;
  const url = new URL(req.url);
  const got =
    req.headers.get("x-webhook-token") ||
    req.headers.get("apikey") ||
    url.searchParams.get("token") ||
    "";
  // Comparação em tempo constante (não vaza o segredo via timing).
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Atualiza status de mensagem enviada a partir de `SEND-MESSAGE-UPDATE`. */
async function handleReceipt(data: unknown): Promise<boolean> {
  try {
    if (!data || typeof data !== "object") return false;
    const d = data as Record<string, unknown>;
    const key = (d.key ?? {}) as Record<string, unknown>;
    const externalId =
      str(d.messageId) ?? str(d.keyId) ?? str(key.id) ?? str(d.id);
    if (!externalId) return false;
    const raw = `${str(d.status) ?? ""} ${str(d.type) ?? ""}`.toUpperCase();
    const status = /READ|PLAYED|SEEN/.test(raw)
      ? "read"
      : /DELIVER|ACK|SENT/.test(raw)
        ? "delivered"
        : null;
    if (!status) return false;
    await db().update(messages).set({ status }).where(eq(messages.externalId, externalId));
    return true;
  } catch {
    return false;
  }
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
  if (!body || typeof body !== "object") return NextResponse.json({ ok: true, ignored: true });
  const root = body as Record<string, unknown>;
  const event = root.event ?? root.type;
  const norm = normalizeEventName(event);

  // Recibos de entrega/leitura das mensagens enviadas pelo inbox.
  if (norm === "sendmessageupdate" || norm === "messagesupdate") {
    const ok = await handleReceipt(root.data ?? root);
    return NextResponse.json({ ok: true, receipts: ok });
  }
  if (!isMessagesUpsert(event)) return NextResponse.json({ ok: true, ignored: true });

  const raw = root.data ?? root;
  // Algumas versões envelopam em array (`data: [...]`); processa o primeiro.
  const data = Array.isArray(raw) ? raw[0] : raw;
  const inb = extractInbound(data);
  if (!inb) return NextResponse.json({ ok: true, ignored: true });

  // Canal: hoje só WhatsApp chega pela Evolution; o campo existe para o
  // futuro multirrede sem mudar o contrato do webhook.
  const channel = "whatsapp";
  try {
    const r = await ingestInbound(channel, inb);
    if (r.ignored) return NextResponse.json({ ok: true, ignored: true });
    return NextResponse.json({
      ok: true,
      deduped: r.deduped,
      conversationId: r.conversation.id,
      messageId: r.messageId,
    });
  } catch (e) {
    // 500 = a Evolution retenta depois; a ingestão idempotente evita duplicatas.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// GET de verificação manual (abre no navegador p/ conferir deploy + segredo).
export async function GET() {
  const protected_ = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim().length >= 8;
  return NextResponse.json({ ok: true, webhook: "evolution", secret: protected_ ? "on" : "off" });
}
