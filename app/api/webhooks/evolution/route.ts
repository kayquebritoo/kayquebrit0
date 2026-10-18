import { NextResponse, after } from "next/server";
import { isAgentMessage, ownerPhone, runAgentTurn } from "@/lib/kbos/agent";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { messages } from "@/lib/kbos/schema";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";
import { isEvolutionWebhookAuthorized } from "@/lib/kbos/evolution";
import { handleOptOut } from "@/lib/kbos/optout";
import { logHook, maskChat } from "@/lib/kbos/webhook-log";
import {
  extractInbound,
  ingestInbound,
  isMessagesUpsert,
  normalizeEventName,
} from "@/lib/kbos/inbox";

// Webhook inbound da Evolution API — PÚBLICO (a Evolution não tem cookie de
// sessão; o proxy não exige auth em `/api/webhooks/*`).
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
  if (limited) {
    await logHook({ event: "?", result: "rate-limit (429)" });
    return limited;
  }
  if (!isEvolutionWebhookAuthorized(req)) {
    await logHook({ event: "?", result: "não autorizado (401): token do webhook não confere" });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    await logHook({ event: "?", result: "corpo JSON inválido (400)" });
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: true, ignored: true });
  const root = body as Record<string, unknown>;
  const event = root.event ?? root.type;
  const norm = normalizeEventName(event);

  // Recibos de entrega/leitura das mensagens enviadas pelo inbox.
  if (norm === "sendmessageupdate" || norm === "messagesupdate") {
    const ok = await handleReceipt(root.data ?? root);
    await logHook({ event: String(event), result: ok ? "recibo aplicado" : "recibo sem mensagem correspondente" });
    return NextResponse.json({ ok: true, receipts: ok });
  }
  if (!isMessagesUpsert(event)) {
    await logHook({ event: String(event ?? "sem evento"), result: "ignorado (não é mensagem nova)" });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const raw = root.data ?? root;
  // Algumas versões envelopam em array (`data: [...]`); processa o primeiro.
  const data = Array.isArray(raw) ? raw[0] : raw;
  const inb = extractInbound(data);
  if (!inb) {
    const d = (data ?? {}) as { key?: { remoteJid?: string }; messageType?: string };
    await logHook({
      event: String(event),
      result: "ignorado (formato não reconhecido)",
      detail: `${maskChat(d.key?.remoteJid) ?? "sem remoteJid"} · tipo ${d.messageType ?? "?"}`,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Canal: hoje só WhatsApp chega pela Evolution; o campo existe para o
  // futuro multirrede sem mudar o contrato do webhook.
  const channel = "whatsapp";
  try {
    const r = await ingestInbound(channel, inb);
    if (r.ignored) {
      await logHook({ event: String(event), result: "ignorado na ingestão", detail: maskChat(inb.chatId) });
      return NextResponse.json({ ok: true, ignored: true });
    }
    // Mensagem do dono para o agente: responde depois de devolver 200 à
    // Evolution. Só com o webhook protegido por token (ninguém forja o dono).
    const tokenOn = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim().length >= 8;
    const owner = ownerPhone();
    if (!r.deduped && !inb.fromMe && !inb.isGroup) after(() => handleOptOut(inb).catch(() => undefined));
    if (!r.deduped && isAgentMessage(inb, owner, tokenOn)) {
      after(() => runAgentTurn(inb));
      await logHook({ event: "agente", result: "comando do dono → assistente", detail: inb.messageType });
    } else if (!r.deduped && owner && !inb.isGroup && isAgentMessage(inb, owner, true)) {
      await logHook({ event: "agente", result: "ignorado: webhook sem senha (rode a opção 6 do menu)" });
    }
    await logHook({
      event: String(event),
      result: r.deduped ? "duplicada (já existia)" : inb.fromMe ? "enviada por você → inbox" : "recebida → inbox",
      detail: `${maskChat(inb.chatId)} · ${inb.messageType}`,
    });
    return NextResponse.json({
      ok: true,
      deduped: r.deduped,
      conversationId: r.conversation.id,
      messageId: r.messageId,
    });
  } catch (e) {
    // 500 = a Evolution retenta depois; a ingestão idempotente evita duplicatas.
    await logHook({ event: String(event), result: "erro ao gravar (500)", detail: e instanceof Error ? e.message.slice(0, 160) : undefined });
    return serverError(e);
  }
}

// GET de verificação manual (abre no navegador p/ conferir deploy + segredo).
export async function GET() {
  const protected_ = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim().length >= 8;
  return NextResponse.json({ ok: true, webhook: "evolution", secret: protected_ ? "on" : "off" });
}
