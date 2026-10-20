// Cliente da Evolution API (v2) — usado pela tela admin do WhatsApp.
// Instância via EVOLUTION_INSTANCE (padrão: "kbos-primary").
// URL/instância têm default de zero-config no compose (`http://evolution:8080`);
// a chave default (`kbos-dev-key`) espelha `AUTHENTICATION_API_KEY` do compose.
import { randomUUID, timingSafeEqual } from "crypto";
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
 * Base que a EVOLUTION usa para chamar o KBOS de volta.
 * Com a Evolution na mesma rede Docker (`EVOLUTION_API_URL` = `http://evolution:8080`,
 * padrão do compose), usa a rede interna `http://web:3000`: o domínio público
 * pode não "voltar" para dentro da própria VPS (hairpin NAT), e aí nenhuma
 * mensagem chegava ao inbox. `EVOLUTION_WEBHOOK_BASE` força outra base.
 */
export function webhookBase(req?: Request): string | null {
  const forced = (process.env.EVOLUTION_WEBHOOK_BASE || "").trim().replace(/\/$/, "");
  if (forced) return forced;
  try {
    if (new URL(evoConfig().url).hostname === "evolution") return "http://web:3000";
  } catch {
    /* URL inválida: cai na base pública */
  }
  return resolveAppUrl(req);
}

/**
 * URL do webhook inbound (`/api/webhooks/evolution`).
 * Inclui `?token=` quando `EVOLUTION_WEBHOOK_TOKEN` está configurado —
 * sem ele, o receiver responderia 401 e nada chegaria ao inbox.
 */
export function buildWebhookUrl(req?: Request): string | null {
  const appUrl = webhookBase(req);
  if (!appUrl) return null;
  const secret = (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim();
  // Barra final: o app usa `trailingSlash: true`; sem ela o POST da Evolution
  // levava um 308 antes da rota e o evento se perdia.
  const base = `${appUrl}/api/webhooks/evolution/`;
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
 * Extrai o código de pareamento aceitando as variações de campo entre builds
 * da v2 (`pairingCode`, `pairing_code`, `code`). O QR em base64 tem centenas
 * de chars — o guarda de tamanho (<32) impede confundir os dois.
 */
export function extractPairingCode(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  for (const key of ["pairingCode", "pairing_code", "code"]) {
    const v = j[key];
    if (typeof v === "string" && v.trim() && v.trim().length < 32) return v.trim();
  }
  return null;
}

/**
 * QR e/ou código de pareamento (`/instance/connect`).
 * Com `phone` (dígitos, ex. `5511999998888`), tenta gerar o código numérico
 * de 8 dígitos p/ parear no celular sem ler o QR: primeiro `GET ?number=`,
 * depois (se veio sem código) `POST { number }` — builds variam no formato.
 */
export async function getQrCode(phone?: string | null): Promise<{ qrcode: string | null; pairingCode: string | null; detail?: string; status?: number }> {
  warnEvoFallbackOnce();
  const number = normalizePhoneNumber(phone ?? null);
  // Telefone inválido quando explicitamente pedido: não cai p/ QR silencioso.
  if (phone && !number) {
    return { qrcode: null, pairingCode: null, detail: "Telefone inválido (use DDI+DDD+número, 10–15 dígitos)." };
  }
  try {
    const basePath = `/instance/connect/${encodeURIComponent(waInstance())}`;
    const read = (json: Record<string, unknown>) => ({
      qrcode: normalizeQr(json.base64),
      pairingCode: extractPairingCode(json),
    });
    const fail = (status: number) => {
      if (status === 404) return { qrcode: null, pairingCode: null, status, detail: "Instância ainda não criada na Evolution." };
      if (status === 401 || status === 403) return { qrcode: null, pairingCode: null, status, detail: "Chave da Evolution rejeitada (401/403) — confira EVOLUTION_API_KEY." };
      return { qrcode: null, pairingCode: null, status, detail: `Evolution respondeu ${status}.` };
    };
    const r = await evoFetch(basePath + (number ? `?number=${encodeURIComponent(number)}` : ""));
    if (!r.ok) return fail(r.status);
    let out = read(r.json);
    if (out.pairingCode || !number) return { ...out };
    // GET ok mas sem código: tenta o formato alternativo (POST com o número).
    const r2 = await evoFetch(basePath, {
      method: "POST",
      body: JSON.stringify({ number }),
    }).catch(() => null);
    if (r2 && r2.ok) {
      const alt = read(r2.json);
      if (alt.pairingCode || alt.qrcode) out = alt;
    }
    if (out.pairingCode) return { ...out };
    // Diagnóstico (sem vazar segredo): lista os campos que vieram.
    const keys = Object.keys(r.json).join(",");
    return {
      ...out,
      detail: `Evolution não retornou pairingCode p/ ${number} (campos: ${keys || "vazio"}). Confira se o número tem WhatsApp ativo.`,
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

// Upsert = mensagens; UPDATE/SEND_MESSAGE_UPDATE = recibos de leitura;
// CONNECTION_UPDATE só alimenta o diário (prova que a Evolution alcança o app).
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"];

/**
 * Aponta o webhook da instância p/ o inbound do KBOS. Best-effort (nunca lança).
 *
 * A Evolution v2 (a do compose é a v2.3.x) exige o corpo ANINHADO em
 * `{ webhook: { enabled, url, byEvents, base64, events } }` e responde 400
 * ao formato plano da v1 — era por isso que o webhook nunca registrava e o
 * inbox ficava vazio. Tenta a v2 e, se recusada, o formato v1 (builds antigas).
 */
export async function setInstanceWebhook(req?: Request): Promise<boolean> {
  try {
    const url = buildWebhookUrl(req);
    if (!url) return false;
    const path = `/webhook/set/${encodeURIComponent(waInstance())}`;
    const v2 = await evoFetch(path, {
      method: "POST",
      body: JSON.stringify({
        webhook: { enabled: true, url, byEvents: false, base64: false, events: WEBHOOK_EVENTS },
      }),
    });
    if (v2.ok) return true;
    const v1 = await evoFetch(path, {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        url,
        webhook_by_events: false,
        webhook_base64: false,
        events: WEBHOOK_EVENTS,
      }),
    });
    return v1.ok;
  } catch {
    return false;
  }
}

/** Lê a config atual do webhook (`GET /webhook/find`) e confere se é a nossa. */
export async function getWebhookStatus(req?: Request): Promise<{ ok: boolean; url: string | null }> {
  try {
    const r = await evoFetch(`/webhook/find/${encodeURIComponent(waInstance())}`);
    if (!r.ok) return { ok: false, url: null };
    // v2 pode devolver a config direto ou envelopada em `{ webhook: {...} }`.
    const raw = r.json as Record<string, unknown>;
    const j = (raw.webhook && typeof raw.webhook === "object" ? raw.webhook : raw) as Record<string, unknown>;
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
    // v2 usa POST; builds v1 usavam PUT (404 no método errado).
    const path = `/instance/restart/${encodeURIComponent(waInstance())}`;
    let r = await evoFetch(path, { method: "POST" });
    if (r.status === 404 || r.status === 405) r = await evoFetch(path, { method: "PUT" });
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

/**
 * Token opcional dos webhooks da Evolution (`EVOLUTION_WEBHOOK_TOKEN` ≥8 chars),
 * via `?token=`, `x-webhook-token` ou `apikey`. Sem token configurado, aceita
 * (fail-open documentado); com token, compara em tempo constante.
 */
export function isEvolutionWebhookAuthorized(req: Request): boolean {
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

// ── contatos do WhatsApp conectado (importação no CRM) ───────────────────────
const jidNumber = (jid: unknown): string | null => {
  const m = /^(\d{8,15})@s\.whatsapp\.net$/.exec(typeof jid === "string" ? jid : "");
  return m ? m[1] : null;
};

/** Quais números têm WhatsApp ativo (`true`/`false`); `null` quando a Evolution não respondeu. */
export async function checkWhatsappNumbers(numbers: string[]): Promise<Record<string, boolean | null>> {
  const out: Record<string, boolean | null> = Object.fromEntries(numbers.map((n) => [n, null]));
  if (!numbers.length) return out;
  try {
    const r = await evoFetch(`/chat/whatsappNumbers/${encodeURIComponent(waInstance())}`, { method: "POST", body: JSON.stringify({ numbers }) });
    const list = Array.isArray(r.json) ? (r.json as unknown[]) : [];
    if (!r.ok) return out;
    for (const it of list as { exists?: boolean; number?: string; jid?: string }[]) {
      const n = String(it.number || jidNumber(it.jid) || "").replace(/\D/g, "");
      const hit = numbers.find((x) => x === n || (n && (x.endsWith(n) || n.endsWith(x))));
      if (hit) out[hit] = it.exists === true;
    }
  } catch { /* sem resposta: segue sem verificação */ }
  return out;
}

export type WaContact = { number: string; name: string; photoUrl: string | null };

/** Contatos que a Evolution conhece (agenda sincronizada + conversas). Só pessoas (sem grupos/listas). */
export async function listWhatsappContacts(): Promise<{ contacts: WaContact[]; detail?: string }> {
  try {
    const r = await evoFetch(`/chat/findContacts/${encodeURIComponent(waInstance())}`, { method: "POST", body: JSON.stringify({ where: {} }) });
    if (!r.ok) return { contacts: [], detail: `Evolution respondeu ${r.status}. Confira se o WhatsApp está conectado.` };
    const list = Array.isArray(r.json) ? (r.json as { remoteJid?: string; id?: string; pushName?: string; profilePicUrl?: string | null }[]) : [];
    const seen = new Set<string>();
    const contacts: WaContact[] = [];
    for (const it of list) {
      const number = jidNumber(it.remoteJid || it.id);
      if (!number || seen.has(number)) continue;
      seen.add(number);
      contacts.push({ number, name: (it.pushName || "").trim(), photoUrl: /^https?:\/\//.test(it.profilePicUrl || "") ? (it.profilePicUrl as string) : null });
    }
    return { contacts };
  } catch (e) {
    return { contacts: [], detail: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/** Foto de perfil pública do número no WhatsApp (`null` se a pessoa escondeu a foto ou a Evolution não respondeu). */
export async function fetchWhatsappProfilePicture(number: string): Promise<string | null> {
  try {
    const r = await evoFetch(`/chat/fetchProfilePictureUrl/${encodeURIComponent(waInstance())}`, { method: "POST", body: JSON.stringify({ number }) });
    if (!r.ok) return null;
    const j = r.json as { profilePictureUrl?: string | null; profilePicUrl?: string | null } | null;
    const u = j?.profilePictureUrl || j?.profilePicUrl || "";
    return /^https:\/\//.test(u) ? u : null;
  } catch { return null; }
}
