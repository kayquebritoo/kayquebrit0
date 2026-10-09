// Cliente da Evolution API (v2) — usado pela tela admin do WhatsApp.
// Instância via EVOLUTION_INSTANCE (padrão: "kbos-primary").
import { randomUUID } from "crypto";

export type WaState = "open" | "connecting" | "close" | "unknown";

export function waInstance() {
  return process.env.EVOLUTION_INSTANCE || "kbos-primary";
}

export function waConfigured() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);
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

export async function getConnectionState(): Promise<{ state: WaState; detail?: string }> {
  if (!waConfigured()) return { state: "unknown", detail: "Evolution não configurada." };
  try {
    const r = await evoFetch(`/instance/connectionState/${encodeURIComponent(waInstance())}`);
    if (!r.ok) return { state: "unknown", detail: `Evolution respondeu ${r.status}.` };
    const state = (r.json.instance as { state?: unknown } | undefined)?.state;
    return { state: mapState(state) };
  } catch (e) {
    return { state: "unknown", detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

export async function getQrCode(): Promise<{ qrcode: string | null; pairingCode: string | null; detail?: string }> {
  if (!waConfigured()) return { qrcode: null, pairingCode: null, detail: "Evolution não configurada." };
  try {
    const r = await evoFetch(`/instance/connect/${encodeURIComponent(waInstance())}`);
    if (!r.ok) return { qrcode: null, pairingCode: null, detail: `Evolution respondeu ${r.status}.` };
    const pairing = r.json.pairingCode;
    return {
      qrcode: normalizeQr(r.json.base64),
      pairingCode: typeof pairing === "string" && pairing ? pairing : null,
    };
  } catch (e) {
    return { qrcode: null, pairingCode: null, detail: e instanceof Error ? e.message : "Falha de rede." };
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
