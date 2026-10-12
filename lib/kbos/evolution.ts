// Cliente da Evolution API (v2) — usado pela tela admin do WhatsApp.
// Instância via EVOLUTION_INSTANCE (padrão: "kbos-primary").
// URL/instância têm default de zero-config no compose (`http://evolution:8080`);
// a chave default (`kbos-dev-key`) espelha `AUTHENTICATION_API_KEY` do compose.
import { randomUUID } from "crypto";

export type WaState = "open" | "connecting" | "close" | "unknown";

/** Instância padrão (cai aqui quando EVOLUTION_INSTANCE está vazia). */
export const DEFAULT_INSTANCE = "kbos-primary";

/** Chave default de dev do compose — produção deve trocar (ver aviso na UI). */
export const DEFAULT_API_KEY = "kbos-dev-key";

export function waInstance() {
  return process.env.EVOLUTION_INSTANCE || DEFAULT_INSTANCE;
}

export function waConfigured() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
}

/** True quando a chave em uso é a default de dev (UI avisa p/ trocar em prod). */
export function waUsingDefaultKey() {
  return (process.env.EVOLUTION_API_KEY || "") === DEFAULT_API_KEY;
}

function base() {
  return (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
}

async function evoFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { apikey: process.env.EVOLUTION_API_KEY || "", "Content-Type": "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json: json as Record<string, unknown> };
}

/** open | connecting | close (unknown = Evolution fora do ar). */
export function mapState(raw: unknown): WaState {
  return raw === "open" || raw === "connecting" || raw === "close" ? raw : "unknown";
}

/** Normaliza o QR para data-uri pronta p/ <img> (ou null). */
export function normalizeQr(base64: unknown): string | null {
  if (typeof base64 !== "string" || !base64) return null;
  if (base64.startsWith("data:")) return base64;
  return `data:image/png;base64,${base64}`;
}

export async function getConnectionState(): Promise<{ state: WaState; detail?: string; status?: number }> {
  if (!waConfigured()) return { state: "unknown", detail: "Evolution não configurada." };
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

export async function getQrCode(): Promise<{ qrcode: string | null; pairingCode: string | null; detail?: string; status?: number }> {
  if (!waConfigured()) return { qrcode: null, pairingCode: null, detail: "Evolution não configurada." };
  try {
    const r = await evoFetch(`/instance/connect/${encodeURIComponent(waInstance())}`);
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
export async function ensureInstance(): Promise<{ created: boolean; state: WaState; detail?: string }> {
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
    await setInstanceWebhook().catch(() => {});
    const after = await getConnectionState();
    return { created: true, state: after.state, detail: after.detail };
  } catch (e) {
    return { created: false, state: "unknown", detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** Aponta o webhook da instância p/ o inbound do KBOS. Best-effort (nunca lança). */
export async function setInstanceWebhook(): Promise<boolean> {
  try {
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (!appUrl) return false;
    const r = await evoFetch(`/webhook/set/${encodeURIComponent(waInstance())}`, {
      method: "POST",
      body: JSON.stringify({
        url: `${appUrl}/api/webhooks/evolution`,
        webhook_by_events: false,
        webhook_base64: false,
        events: ["MESSAGES_UPSERT"],
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function restartInstance(): Promise<{ ok: boolean; detail?: string }> {
  if (!waConfigured()) return { ok: false, detail: "Evolution não configurada." };
  try {
    const r = await evoFetch(`/instance/restart/${encodeURIComponent(waInstance())}`, { method: "PUT" });
    return r.ok ? { ok: true } : { ok: false, detail: `Evolution respondeu ${r.status}.` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

export async function logoutInstance(): Promise<{ ok: boolean; detail?: string }> {
  if (!waConfigured()) return { ok: false, detail: "Evolution não configurada." };
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
