// Cliente da Evolution API (v2) — usado pela tela admin do WhatsApp.
// Instância via EVOLUTION_INSTANCE (padrão: "kbos-primary").
// URL/instância têm default de zero-config no compose (`http://evolution:8080`);
// a chave default (`kbos-dev-key`) espelha `AUTHENTICATION_API_KEY` do compose.
import { randomUUID } from "crypto";
import { hostBaseFromRequest } from "./email";

export type WaState = "open" | "connecting" | "close" | "unknown";

/** Instância padrão (cai aqui quando EVOLUTION_INSTANCE está vazia). */
export const DEFAULT_INSTANCE = "kbos-primary";

/** Chave default de dev do compose — produção deve trocar (ver aviso na UI). */
export const DEFAULT_API_KEY = "kbos-dev-key";

/**
 * URL default: nome do serviço na rede interna do Docker (web → evolution).
 * Nunca `localhost` — dentro do container, localhost é o próprio `web`.
 */
export const DEFAULT_API_URL = "http://evolution:8080";

export type EvoConfig = { url: string; key: string; instance: string };

/**
 * Zero-config: resolve a config com fallback por variável — env vazia usa o
 * padrão de desenvolvimento em vez de quebrar ("Evolution não configurada").
 * Com isso, a VPS funciona mesmo com o `.env` antigo (sem as chaves).
 */
export function evoConfig(): EvoConfig {
  return {
    url: (process.env.EVOLUTION_API_URL || "").trim() || DEFAULT_API_URL,
    key: (process.env.EVOLUTION_API_KEY || "").trim() || DEFAULT_API_KEY,
    instance: (process.env.EVOLUTION_INSTANCE || "").trim() || DEFAULT_INSTANCE,
  };
}

/** True quando todas as três vars vieram explícitas do ambiente. */
export function evoExplicitConfigured(): boolean {
  return !!(
    (process.env.EVOLUTION_API_URL || "").trim() &&
    (process.env.EVOLUTION_API_KEY || "").trim() &&
    (process.env.EVOLUTION_INSTANCE || "").trim()
  );
}

/** True quando algum padrão interno está em uso (UI avisa p/ endurecer). */
export function evoFallbackActive(): boolean {
  return !evoExplicitConfigured();
}

let _fallbackWarned = false;

/** Log único por processo quando o zero-config entra em ação. */
export function warnEvoFallbackOnce(): void {
  if (_fallbackWarned || evoExplicitConfigured()) return;
  _fallbackWarned = true;
  console.warn(
    "[KBOS] EVOLUTION_* parcial/ausente — usando padrões internos " +
      `(${DEFAULT_API_URL}, instância ${DEFAULT_INSTANCE}). ` +
      "Defina EVOLUTION_API_KEY forte no .env e recrie os containers."
  );
}

export function waInstance() {
  return evoConfig().instance;
}

export function waConfigured() {
  // Zero-config: a config sempre resolve (env ou padrões internos).
  return true;
}

/** True quando a chave em uso é a default de dev (UI avisa p/ trocar em prod). */
export function waUsingDefaultKey() {
  return evoConfig().key === DEFAULT_API_KEY;
}

/**
 * Base canônica do backend p/ webhooks (quem a Evolution chama de volta).
 * `APP_URL` explícito primeiro: o receiver precisa ser o deploy COM banco
 * (VPS), não qualquer origem que abriu o painel. Sem env, cai no host do
 * request; sem request, null (best-effort desiste).
 */
export function resolveAppUrl(req?: Request): string | null {
  const env = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  return hostBaseFromRequest(req);
}

/**
 * URL pública do webhook inbound (`/api/webhooks/evolution`).
 * Inclui `?token=` quando `EVOLUTION_WEBHOOK_TOKEN` está configurado —
 * sem ele, o receiver responderia 401 e nada chegaria ao inbox.
 */
export function buildWebhookUrl(req?: Request): string | null {
  const appUrl = resolveAppUrl(req);
  if (!appUrl) return null;
  const secret = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim();
  const base = `${appUrl}/api/webhooks/evolution`;
  return secret.length >= 8 ? `${base}?token=${encodeURIComponent(secret)}` : base;
}

function base() {
  return evoConfig().url.replace(/\/$/, "");
}

async function evoFetch(path: string, init?: RequestInit) {
  const { key } = evoConfig();
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { apikey: key, "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json: json as Record<string, unknown> };
}

/** open | connecting | close (unknown = Evolution fora do ar). */
export function mapState(raw: unknown): WaState {
  return raw === "open" || raw === "connecting" || raw === "close" ? raw : "unknown";
}

/** Normaliza telefone p/ pareamento (só dígitos, 10–15). Null se inválido. */
export function normalizePhoneNumber(value: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Normaliza o QR para data-uri pronta p/ <img> (ou null). */
export function normalizeQr(base64: unknown): string | null {
  if (typeof base64 !== "string" || !base64) return null;
  if (base64.startsWith("data:")) return base64;
  return `data:image/png;base64,${base64}`;
}

export async function getConnectionState(): Promise<{ state: WaState; detail?: string; status?: number }> {
  warnEvoFallbackOnce();
  try {
    const r = await evoFetch(`/instance/connectionState/${encodeURIComponent(waInstance())}`);
    if (r.status === 404) return { state: "unknown", status: 404, detail: "Instância ainda não criada na Evolution." };
    if (r.status === 401 || r.status === 403) return { state: "unknown", status: r.status, detail: "Chave da Evolution rejeitada (401/403) — confira EVOLUTION_API_KEY." };
    if (!r.ok) return { state: "unknown", status: r.status, detail: `Evolution respondeu ${r.status}.` };
    const state = (r.json.instance as { state?: unknown } | undefined)?.state;
    return { state: mapState(state) };
  } catch (e) {
    return { state: "unknown", detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/**
 * QR e/ou código de pareamento (`GET /instance/connect`).
 * Com `phone` (dígitos, ex. `5511999998888`), a Evolution v2 gera o código
 * numérico de 8 dígitos p/ parear no celular sem ler o QR.
 */
export async function getQrCode(phone?: string | null): Promise<{ qrcode: string | null; pairingCode: string | null; detail?: string; status?: number }> {
  warnEvoFallbackOnce();
  const number = normalizePhoneNumber(phone ?? null);
  // Telefone inválido quando explicitamente pedido: não cai p/ QR silencioso.
  if (phone && !number) {
    return { qrcode: null, pairingCode: null, detail: "Telefone inválido (use DDI+DDD+número, 10–15 dígitos)." };
  }
  try {
    const path =
      `/instance/connect/${encodeURIComponent(waInstance())}` +
      (number ? `?number=${encodeURIComponent(number)}` : "");
    const r = await evoFetch(path);
    if (r.status === 404) return { qrcode: null, pairingCode: null, status: 404, detail: "Instância ainda não criada na Evolution." };
    if (r.status === 401 || r.status === 403) return { qrcode: null, pairingCode: null, status: r.status, detail: "Chave da Evolution rejeitada (401/403) — confira EVOLUTION_API_KEY." };
    if (!r.ok) return { qrcode: null, pairingCode: null, status: r.status, detail: `Evolution respondeu ${r.status}.` };
    const pairing = r.json.pairingCode;
    return {
      qrcode: normalizeQr(r.json.base64),
      pairingCode: typeof pairing === "string" && pairing ? pairing : null,
    };
  } catch (e) {
    return { qrcode: null, pairingCode: null, detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/**
 * Garante a instância na Evolution (auto-provisionamento).
 * Se `connectionState` responde 404 (instância inexistente), cria via
 * `POST /instance/create` (WHATSAPP-BAILEYS + QR) e configura o webhook de
 * inbound p/ `/api/webhooks/evolution` (best-effort, nunca lança).
 * Retorna `{ created }` + estado atualizado.
 */
export async function ensureInstance(req?: Request): Promise<{ created: boolean; state: WaState; detail?: string }> {
  const check = await getConnectionState();
  if (check.status !== 404) return { created: false, state: check.state, detail: check.detail };
  try {
    const r = await evoFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: waInstance(),
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });
    if (!r.ok) {
      return { created: false, state: "unknown", detail: `Falha ao criar instância (${r.status}).` };
    }
    // Webhook inbound (best-effort): sem ele, mensagens recebidas não chegam.
    await setInstanceWebhook(req).catch(() => {});
    const after = await getConnectionState();
    return { created: true, state: after.state, detail: after.detail };
  } catch (e) {
    return { created: false, state: "unknown", detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** Aponta o webhook da instância p/ o inbound do KBOS. Best-effort (nunca lança). */
export async function setInstanceWebhook(req?: Request): Promise<boolean> {
  try {
    const url = buildWebhookUrl(req);
    if (!url) return false;
    const r = await evoFetch(`/webhook/set/${encodeURIComponent(waInstance())}`, {
      method: "POST",
      body: JSON.stringify({
        url,
        webhook_by_events: false,
        webhook_base64: false,
        // Upsert = mensagens; UPDATE/SEND_MESSAGE_UPDATE = recibos de leitura.
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE"],
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Lê a config atual do webhook (`GET /webhook/find`) e confere se é a nossa. */
export async function getWebhookStatus(req?: Request): Promise<{ ok: boolean; url: string | null }> {
  try {
    const r = await evoFetch(`/webhook/find/${encodeURIComponent(waInstance())}`);
    if (!r.ok) return { ok: false, url: null };
    const j = r.json as Record<string, unknown>;
    const enabled = j.enabled !== false;
    const url = typeof j.url === "string" && j.url ? j.url : null;
    const ours = buildWebhookUrl(req);
    const same =
      !!url && !!ours && url.replace(/\/$/, "") === ours.replace(/\/$/, "");
    return { ok: enabled && same, url };
  } catch {
    return { ok: false, url: null };
  }
}

export async function restartInstance(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const r = await evoFetch(`/instance/restart/${encodeURIComponent(waInstance())}`, { method: "PUT" });
    return r.ok ? { ok: true } : { ok: false, detail: `Evolution respondeu ${r.status}.` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

export async function logoutInstance(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const r = await evoFetch(`/instance/logout/${encodeURIComponent(waInstance())}`, { method: "DELETE" });
    return r.ok ? { ok: true } : { ok: false, detail: `Evolution respondeu ${r.status}.` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** request-id p/ correlação nos logs. */
export function waTrace() {
  return randomUUID().slice(0, 8);
}
