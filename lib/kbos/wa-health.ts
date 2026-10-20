// Monitor do WhatsApp: o assistente depende dele, então queda = aviso urgente por OUTRO canal
// (e-mail e, se configurado, Telegram) + faixa vermelha no KBOS. Regra pura em `nextHealth` (testável).
import { getRedis, ensureRedis } from "./jobs";
import { getConnectionState, type WaState } from "./evolution";
import { sendEmail, appUrlEnv } from "./email";
import { ADMIN_EMAIL } from "./admin-access";
import { tgApi, tgConfigured } from "./telegram";

export const WA_HEALTH_KEY = "kbos:wa:health";
/** Falhas seguidas (a cada ~2 min) antes de alertar: ignora oscilação de segundos. */
export const ALERT_AFTER = 2;
/** Enquanto continuar fora, repete o aviso a cada 30 min. */
export const REMIND_MS = 30 * 60_000;

export type Health = { down: number; since: string | null; alertedAt: number | null; state: WaState; checkedAt: string };
export type HealthAction = "none" | "alert" | "remind" | "recovered";

export const emptyHealth = (): Health => ({ down: 0, since: null, alertedAt: null, state: "open", checkedAt: new Date(0).toISOString() });

export function nextHealth(prev: Health, state: WaState, nowMs: number): { next: Health; action: HealthAction } {
  const checkedAt = new Date(nowMs).toISOString();
  if (state === "open") {
    const wasAlerted = prev.alertedAt != null;
    return { next: { down: 0, since: null, alertedAt: null, state, checkedAt }, action: wasAlerted ? "recovered" : "none" };
  }
  const down = prev.down + 1;
  const since = prev.since ?? checkedAt;
  if (down >= ALERT_AFTER && prev.alertedAt == null) return { next: { down, since, alertedAt: nowMs, state, checkedAt }, action: "alert" };
  if (prev.alertedAt != null && nowMs - prev.alertedAt >= REMIND_MS) return { next: { down, since, alertedAt: nowMs, state, checkedAt }, action: "remind" };
  return { next: { down, since, alertedAt: prev.alertedAt, state, checkedAt }, action: "none" };
}

export async function readHealth(): Promise<Health | null> {
  try {
    if (!(await ensureRedis(800))) return null;
    const raw = await getRedis().get(WA_HEALTH_KEY);
    return raw ? ({ ...emptyHealth(), ...JSON.parse(raw) } as Health) : null;
  } catch { return null; }
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Belem", dateStyle: "short", timeStyle: "short" }) : "agora");

async function notify(subject: string, text: string) {
  const link = `${appUrlEnv()}/admin/whatsapp`;
  const to = (process.env.ALERT_EMAIL || ADMIN_EMAIL).trim();
  const email = await sendEmail(to, subject, `<p style="font:16px/1.5 sans-serif">${text}</p><p><a href="${link}" style="font:700 16px sans-serif">Abrir /admin/whatsapp</a></p>`);
  const chat = (process.env.TELEGRAM_ALERT_CHAT_ID || "").trim();
  let tg = false;
  if (chat && tgConfigured()) {
    try { await tgApi("sendMessage", { chat_id: chat, text: `${subject}\n${text}\n${link}` }); tg = true; } catch { /* segue */ }
  }
  return { email: email.sent, telegram: tg, error: email.error };
}

/** Job `whatsapp.health` (a cada 2 min no worker). */
export async function handleWhatsappHealth(now = Date.now()) {
  if (!(await ensureRedis(1500))) return { skipped: "redis fora" };
  const r = getRedis();
  const cs = await getConnectionState();
  // 404 = instância nunca criada (instalação nova): não é queda.
  if (cs.status === 404) return { skipped: "instância ainda não criada" };
  const prevRaw = await r.get(WA_HEALTH_KEY);
  const prev = prevRaw ? ({ ...emptyHealth(), ...JSON.parse(prevRaw) } as Health) : emptyHealth();
  const { next, action } = nextHealth(prev, cs.state, now);
  await r.set(WA_HEALTH_KEY, JSON.stringify(next), "EX", 7 * 86_400);
  let sent: Awaited<ReturnType<typeof notify>> | undefined;
  if (action === "alert" || action === "remind") {
    sent = await notify(
      "🚨 WhatsApp do KBOS fora do ar",
      `O WhatsApp do KBOS está desconectado desde ${fmt(next.since)} (estado: ${next.state}). O assistente não responde até reconectar. Abra o painel e leia o QR em Aparelhos conectados.`
    );
  } else if (action === "recovered") {
    sent = await notify("✅ WhatsApp do KBOS voltou", `Reconectado. Ficou fora desde ${fmt(prev.since)}.`);
  }
  return { state: cs.state, action, sent };
}
