import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody, waAdminActionSchema } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";
import {
  ensureInstance,
  evoFallbackActive,
  getConnectionState,
  getQrCode,
  getWebhookStatus,
  logoutInstance,
  normalizePhoneNumber,
  restartInstance,
  setInstanceWebhook,
  waInstance,
  waUsingDefaultKey,
  warnEvoFallbackOnce,
} from "@/lib/kbos/evolution";
import { readHookLog } from "@/lib/kbos/webhook-log";

// GET ?qr=1 — status da instância; com qr=1 inclui QR fresco (expira em ~60s)
// + auto-cria a instância quando ausente e repara/verifica o webhook.
// Só admin. Zero-config: env vazia usa os padrões internos (compose) em vez
// de 503 — a resposta sinaliza `fallback: true` para a UI avisar.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "admin:whatsapp");
  if (limited) return limited;
  warnEvoFallbackOnce();
  try {
    const params = new URL(req.url).searchParams;
    // Diário do webhook (?log=1): últimas chamadas da Evolution ao KBOS.
    if (params.get("log") === "1") {
      const log = await readHookLog();
      return NextResponse.json({ ok: true, instance: waInstance(), log, redis: log !== null });
    }
    // Reparo dedicado da escuta (?repair=1): re-registra o webhook e devolve
    // o status — usado quando a sessão JÁ está ativa (open), caso em que o
    // polling normal para e o repair do ?qr=1 não roda mais.
    if (params.get("repair") === "1") {
      const st = await getConnectionState();
      let created = false;
      let state = st.state;
      if (st.status === 404) {
        const ensured = await ensureInstance(req);
        created = ensured.created;
        state = ensured.state;
      }
      await setInstanceWebhook(req);
      const webhook = await getWebhookStatus(req);
      return NextResponse.json({
        ok: true,
        instance: waInstance(),
        state,
        webhook,
        created,
        fallback: evoFallbackActive(),
        usingDefaultKey: waUsingDefaultKey(),
        checkedAt: new Date().toISOString(),
      });
    }
    const wantQr = params.get("qr") === "1";
    // Pareamento por número (código de 8 dígitos): `?qr=1&phone=5511999998888`.
    const phoneRaw = (params.get("phone") || "").trim();
    let phone: string | null = null;
    if (phoneRaw) {
      phone = normalizePhoneNumber(phoneRaw);
      if (!phone) {
        return NextResponse.json(
          { error: "Telefone inválido (use DDI+DDD+número, 10–15 dígitos)." },
          { status: 400 }
        );
      }
    }
    const conn = await getConnectionState();
    let { state, detail } = conn;
    // Auto-provisionamento: instância inexistente (404) é criada na hora
    // (com webhook de inbound) para o QR renderizar sem erro.
    let created = false;
    if (wantQr && conn.status === 404) {
      // Webhook mira o backend canônico (APP_URL) ou a origem do request.
      const ensured = await ensureInstance(req);
      created = ensured.created;
      state = ensured.state;
      detail = ensured.detail;
    }
    let qrcode: string | null = null;
    let pairingCode: string | null = null;
    // Escuta do webhook: com a Evolution alcançável, o `set` é idempotente
    // e barato — repara sozinho (ex.: instância criada à mão sem webhook).
    let webhook: { ok: boolean; url: string | null } | null = null;
    if (wantQr && conn.status !== undefined) {
      const [qr, wh] = await Promise.all([
        state !== "open" ? getQrCode(phone) : Promise.resolve(null),
        (async () => {
          await setInstanceWebhook(req);
          return getWebhookStatus(req);
        })(),
      ]);
      webhook = wh;
      if (qr) {
        qrcode = qr.qrcode;
        pairingCode = qr.pairingCode;
        // Sem QR, o motivo importa; com pedido de pareamento, o diagnóstico
        // do código importa mesmo havendo QR.
        if ((!qrcode || (phone && !qr.pairingCode)) && qr.detail) detail = qr.detail;
      }
    } else if (wantQr && state !== "open") {
      // QR só faz sentido fora do `open` — e só quando pedido (expira rápido).
      const qr = await getQrCode(phone);
      qrcode = qr.qrcode;
      pairingCode = qr.pairingCode;
      if ((!qrcode || (phone && !qr.pairingCode)) && qr.detail) detail = qr.detail;
    }
    return NextResponse.json({
      configured: true,
      instance: waInstance(),
      state,
      qrcode,
      pairingCode,
      created,
      webhook,
      // Zero-config ativo (padrões internos em uso): a UI orienta a endurecer.
      fallback: evoFallbackActive(),
      // Produção com a chave default de dev: funciona, mas a UI avisa p/ trocar.
      usingDefaultKey: waUsingDefaultKey(),
      ...(detail ? { detail } : {}),
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return serverError(e);
  }
}

// POST {action: restart|logout} — reconexão / desvincular (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "admin:whatsapp");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, waAdminActionSchema);
    if ("error" in parsed) return parsed.error;
    const r =
      parsed.data.action === "restart" ? await restartInstance() : await logoutInstance();
    if (!r.ok) return NextResponse.json({ error: r.detail || "Falha." }, { status: 502 });
    return NextResponse.json({ ok: true, action: parsed.data.action });
  } catch (e) {
    return serverError(e);
  }
}
