// Ponte com a mLabs via MCP (https://mcp.mlabs.io). SOMENTE LEITURA: lê agenda e demandas e espelha no calendário do Conteúdo.
// O token fica só no servidor (MLABS_MCP_TOKEN). Nada aqui cria, edita ou apaga coisas na mLabs.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { socialPosts } from "./schema";
import { PublicError } from "./http";
import type { PostFormat, PostStatus } from "./social-import";

const ENDPOINT = process.env.MLABS_MCP_URL || "https://mcp.mlabs.io/mcp";
export const mlabsConfigured = () => (process.env.MLABS_MCP_TOKEN || "").length >= 16;

// ── cliente MCP mínimo (JSON-RPC sobre HTTP; aceita resposta JSON ou SSE) ──────────
async function rpc(token: string, body: unknown, session?: string) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`, ...(session ? { "mcp-session-id": session } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401 || res.status === 403) throw new PublicError("A mLabs recusou o token. Gere outro em Conta → API / MCP Server.", 502);
  if (res.status === 429) throw new PublicError("A mLabs pediu para aguardar um pouco. Tente em 1 minuto.", 429);
  if (!res.ok && res.status !== 202) throw new PublicError(`A mLabs respondeu ${res.status}.`, 502);
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    const data = res.headers.get("content-type")?.includes("event-stream") ? [...text.matchAll(/^data:\s*(.+)$/gm)].map((m) => m[1]).pop() ?? "" : text;
    try { json = JSON.parse(data); } catch { json = null; }
  }
  return { json: json as { result?: { content?: { text?: string }[]; structuredContent?: unknown; isError?: boolean }; error?: { message?: string } } | null, session: res.headers.get("mcp-session-id") ?? session };
}

export class MlabsClient {
  private session: string | undefined;
  private n = 1;
  constructor(private token: string) {}
  async init() {
    const r = await rpc(this.token, { jsonrpc: "2.0", id: this.n++, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "kbos", version: "1" } } });
    this.session = r.session;
    await rpc(this.token, { jsonrpc: "2.0", method: "notifications/initialized" }, this.session).catch(() => undefined);
  }
  async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const r = await rpc(this.token, { jsonrpc: "2.0", id: this.n++, method: "tools/call", params: { name, arguments: args } }, this.session);
    if (r.json?.error) throw new PublicError(`mLabs: ${r.json.error.message ?? "erro"}`, 502);
    const out = r.json?.result;
    if (out?.isError) throw new PublicError(`mLabs: ${out.content?.[0]?.text?.slice(0, 160) ?? "erro"}`, 502);
    if (out?.structuredContent) return out.structuredContent as T;
    try { return JSON.parse(out?.content?.[0]?.text ?? "null") as T; } catch { throw new PublicError("Resposta inesperada da mLabs.", 502); }
  }
}

// ── tradução (funções puras, testadas) ───────────────────────────────────────────
export type Schedule = { id: string; content?: string; status?: string; scheduledAt?: string; channelSourceKey?: string; profileId?: string };
export type Draft = { externalKey: string; profileId: string; brand: string | null; title: string; format: PostFormat; networks: string[]; scheduledAt: Date; status: PostStatus; caption: string };

export function scheduleStatus(s: string | undefined): PostStatus {
  switch ((s || "").toLowerCase()) {
    case "published": return "postado";
    case "failed": return "erro";
    case "pending_approval": return "aprovacao";
    case "draft": return "roteiro";
    default: return "agendado";
  }
}

export function workflowStatus(s: string): PostStatus {
  switch (s) {
    case "draft": return "roteiro";
    case "waiting_for_content":
    case "waiting_internal_approve": return "producao";
    case "waiting_external_approve": return "aprovacao";
    case "waiting_adjustment": return "ajustes";
    case "waiting_for_schedule": return "aprovado";
    case "approved_and_schedule": return "agendado";
    case "done": return "postado";
    default: return "roteiro";
  }
}

export function brandOfProfile(name: string): string | null {
  if (/hotel/i.test(name)) return "Hotel";
  if (/lounge/i.test(name)) return "Lounge";
  if (/pra[cç]a/i.test(name)) return "Praça";
  return null;
}

export function formatOfChannels(keys: string[]): PostFormat {
  const k = keys.join(" ").toLowerCase();
  if (/stor/.test(k)) return "story";
  if (/reels|shorts|tiktok|youtube/.test(k)) return "reels";
  return "outro";
}

const RANK: Record<PostStatus, number> = { erro: 5, postado: 4, agendado: 3, aprovado: 2, aprovacao: 1, ajustes: 1, producao: 0, captacao: 0, roteiro: 0 };
const titleOf = (c: string) => (c.split(/\n/)[0] || "").replace(/\s+/g, " ").trim().slice(0, 90) || "Sem título";

/** Uma arte publicada em várias redes vira um só post (mesma legenda, mesmo horário, mesmo perfil). */
export function groupSchedules(items: Schedule[], profileNames: Record<string, string>): Draft[] {
  const groups = new Map<string, Draft>();
  for (const s of items) {
    if (!s.profileId || !s.scheduledAt || !s.id) continue;
    const when = new Date(s.scheduledAt);
    if (Number.isNaN(when.getTime())) continue;
    const content = (s.content ?? "").trim();
    const key = `mlabs:${s.profileId}:${createHash("sha1").update(`${content}|${when.toISOString()}`).digest("hex").slice(0, 20)}`;
    const st = scheduleStatus(s.status);
    const g = groups.get(key);
    if (g) {
      if (s.channelSourceKey && !g.networks.includes(s.channelSourceKey)) g.networks.push(s.channelSourceKey);
      // se uma rede falhou, o post inteiro merece atenção; senão vale o estágio menos avançado
      if (st === "erro" || (g.status !== "erro" && RANK[st] < RANK[g.status])) g.status = st;
    } else {
      groups.set(key, { externalKey: key, profileId: s.profileId, brand: brandOfProfile(profileNames[s.profileId] ?? ""), title: titleOf(content), format: "outro", networks: s.channelSourceKey ? [s.channelSourceKey] : [], scheduledAt: when, status: st, caption: content });
    }
  }
  for (const g of groups.values()) g.format = formatOfChannels(g.networks);
  return [...groups.values()].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

// ── sincronização ────────────────────────────────────────────────────────────────
export async function syncFromMlabs(projectId: string) {
  const token = process.env.MLABS_MCP_TOKEN || "";
  if (!mlabsConfigured()) throw new PublicError("A mLabs ainda não está conectada: falta o MLABS_MCP_TOKEN na VPS.", 503);
  const c = new MlabsClient(token);
  await c.init();
  const profiles = await c.call<{ items?: { id: string; name: string; active?: boolean }[] }>("list_profiles", { limit: 100, includeConnectedChannels: false });
  const wanted = (profiles.items ?? []).filter((p) => p.active !== false && brandOfProfile(p.name));
  const names = Object.fromEntries(wanted.map((p) => [p.id, p.name]));
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const until = new Date(Date.now() + 120 * 86_400_000).toISOString();

  const all: Schedule[] = [];
  for (const p of wanted) {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await c.call<{ schedules?: Schedule[]; nextCursor?: string }>("list_scheduled_posts", { profileId: p.id, startDate: since, endDate: until, limit: 100, ...(cursor ? { cursor } : {}) });
      all.push(...(r.schedules ?? []));
      cursor = r.nextCursor;
      if (!cursor || !(r.schedules ?? []).length) break;
    }
  }
  const drafts = groupSchedules(all, names);

  const existing = await db().select().from(socialPosts).where(eq(socialPosts.projectId, projectId));
  const byKey = new Map(existing.filter((e) => e.externalKey).map((e) => [e.externalKey as string, e]));
  const dayOf = (d: Date | null) => (d ? d.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }) : "");
  // post que veio do .ics (mesma legenda no mesmo dia) conta como o mesmo: só atualiza a etapa
  const byCaption = new Map(existing.filter((e) => e.caption).map((e) => [`${(e.caption as string).trim()}|${dayOf(e.scheduledAt)}`, e]));

  let created = 0, updated = 0;
  for (const d of drafts) {
    const row = byKey.get(d.externalKey) ?? byCaption.get(`${d.caption}|${dayOf(d.scheduledAt)}`);
    if (!row) {
      await db().insert(socialPosts).values({ projectId, brand: d.brand, title: d.title, format: d.format, networks: d.networks, scheduledAt: d.scheduledAt, status: d.status, caption: d.caption, externalKey: d.externalKey, copies: Math.max(1, d.networks.length) });
      created++;
    } else if (["postado", "erro", "agendado"].includes(d.status) && row.status !== d.status) {
      await db().update(socialPosts).set({ status: d.status, networks: d.networks, updatedAt: new Date() }).where(and(eq(socialPosts.id, row.id), eq(socialPosts.projectId, projectId)));
      updated++;
    }
  }
  return { profiles: wanted.length, found: drafts.length, created, updated };
}
