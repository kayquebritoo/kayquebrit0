// Meta Graph API: conectar Páginas do Facebook + Instagram profissional e publicar.
// Só servidor. Toda chamada leva appsecret_proof. `f` é injetável para os testes não tocarem a rede.
import { createHmac } from "node:crypto";
import { appUrlEnv } from "./email";
import { SocialError, type Media, type PublishInput, type PublishResult } from "./social/types";

export const GRAPH_VERSION = () => process.env.META_GRAPH_VERSION || "v23.0";
export const metaConfigured = () => (process.env.META_APP_ID || "").length > 4 && (process.env.META_APP_SECRET || "").length >= 16;
const GRAPH = () => `https://graph.facebook.com/${GRAPH_VERSION()}`;

/** Permissões pedidas no login (publicar e ler resultados; nada de mensagens nem anúncios). */
export const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights",
  "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "business_management",
];

export class MetaError extends SocialError {
  constructor(message: string, code?: number, expired = false) { super(message, code, expired); }
}

type Fetch = typeof fetch;
const proof = (token: string, secret = process.env.META_APP_SECRET || "") => createHmac("sha256", secret).update(token).digest("hex");

async function graph<T>(f: Fetch, method: "GET" | "POST" | "DELETE", path: string, token: string | null, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  if (token) { qs.set("access_token", token); qs.set("appsecret_proof", proof(token)); }
  const url = `${GRAPH()}${path}`;
  const res = method !== "POST"
    ? await f(`${url}?${qs}`, { method, signal: AbortSignal.timeout(30_000) })
    : await f(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: qs, signal: AbortSignal.timeout(60_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new MetaError(e.error_user_msg || e.message || `A Meta respondeu ${res.status}.`, e.code, e.code === 190 || e.code === 102);
  }
  return json;
}

// ── login ──────────────────────────────────────────────────────────────────────
export const metaRedirectUri = () => `${appUrlEnv()}/api/social/meta/callback/`;

export function metaLoginUrl(redirectUri: string, state: string) {
  const qs = new URLSearchParams({ client_id: process.env.META_APP_ID || "", redirect_uri: redirectUri, state, response_type: "code", scope: META_SCOPES.join(",") });
  return `https://www.facebook.com/${GRAPH_VERSION()}/dialog/oauth?${qs}`;
}

/** Código do login → token de usuário de longa duração (~60 dias). Os tokens de Página tirados dele não expiram. */
export async function exchangeCode(code: string, redirectUri: string, f: Fetch = fetch) {
  const base = { client_id: process.env.META_APP_ID || "", client_secret: process.env.META_APP_SECRET || "" };
  const short = await graph<{ access_token: string }>(f, "GET", "/oauth/access_token", null, { ...base, redirect_uri: redirectUri, code });
  const long = await graph<{ access_token: string; expires_in?: number }>(f, "GET", "/oauth/access_token", null, { ...base, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null };
}

export type MetaAccount = { network: "facebook" | "instagram"; externalId: string; pageId: string; name: string; username: string | null; pictureUrl: string | null; token: string };

/** Páginas que a pessoa administra e o Instagram profissional ligado a cada uma. */
export async function listMetaAccounts(userToken: string, f: Fetch = fetch): Promise<MetaAccount[]> {
  type Page = { id: string; name: string; access_token: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } };
  const out: MetaAccount[] = [];
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const r = await graph<{ data: Page[]; paging?: { cursors?: { after?: string }; next?: string } }>(f, "GET", "/me/accounts", userToken, {
      fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}", limit: 100, after,
    });
    for (const p of r.data ?? []) {
      out.push({ network: "facebook", externalId: p.id, pageId: p.id, name: p.name, username: null, pictureUrl: p.picture?.data?.url ?? null, token: p.access_token });
      const ig = p.instagram_business_account;
      if (ig) out.push({ network: "instagram", externalId: ig.id, pageId: p.id, name: ig.name || ig.username || p.name, username: ig.username ?? null, pictureUrl: ig.profile_picture_url ?? null, token: p.access_token });
    }
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** Tira a permissão do app na conta da pessoa (o login inteiro deixa de valer). */
export async function revokeMeta(userToken: string, f: Fetch = fetch) {
  await graph<{ success?: boolean }>(f, "DELETE", "/me/permissions", userToken);
  return true;
}

// ── publicar ───────────────────────────────────────────────────────────────────
export type { Media, PublishInput, PublishResult };
type Wait = (ms: number) => Promise<void>;
const sleep: Wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera o Instagram processar o contêiner (vídeo leva de segundos a minutos). */
async function waitContainer(f: Fetch, id: string, token: string, wait: Wait, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(f, "GET", `/${id}`, token, { fields: "status_code,status" });
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new MetaError(`O Instagram não aceitou o arquivo (${s.status || s.status_code}). Confira formato, duração e proporção.`);
    await wait(i < 5 ? 3000 : 10_000);
  }
  throw new MetaError("O Instagram demorou demais para processar o vídeo. Tento de novo mais tarde.");
}

export async function publishInstagram(igId: string, token: string, input: PublishInput, f: Fetch = fetch, wait: Wait = sleep): Promise<PublishResult> {
  const { media, caption } = input;
  if (!media.length) throw new MetaError("Envie o arquivo final do post antes de publicar.");
  const one = (m: Media, extra: Record<string, string | boolean>) =>
    graph<{ id: string }>(f, "POST", `/${igId}/media`, token, { ...(m.kind === "image" ? { image_url: m.url } : { video_url: m.url }), ...extra });
  let container: string;
  if (input.format === "story") {
    container = (await one(media[0], { media_type: "STORIES" })).id;
    if (media[0].kind === "video") await waitContainer(f, container, token, wait);
  } else if (media.length > 1 || input.format === "carrossel") {
    if (media.length < 2) throw new MetaError("Carrossel precisa de pelo menos 2 arquivos.");
    if (media.length > 10) throw new MetaError("O Instagram aceita no máximo 10 itens no carrossel.");
    const kids: string[] = [];
    for (const m of media) {
      const k = (await one(m, { is_carousel_item: true, ...(m.kind === "video" ? { media_type: "VIDEO" } : {}) })).id;
      if (m.kind === "video") await waitContainer(f, k, token, wait);
      kids.push(k);
    }
    container = (await graph<{ id: string }>(f, "POST", `/${igId}/media`, token, { media_type: "CAROUSEL", children: kids.join(","), caption })).id;
    await waitContainer(f, container, token, wait);
  } else if (media[0].kind === "video") {
    container = (await one(media[0], { media_type: "REELS", caption, share_to_feed: true })).id;
    await waitContainer(f, container, token, wait);
  } else {
    container = (await one(media[0], { caption })).id;
    await waitContainer(f, container, token, wait);
  }
  const pub = await graph<{ id: string }>(f, "POST", `/${igId}/media_publish`, token, { creation_id: container });
  const link = await graph<{ permalink?: string }>(f, "GET", `/${pub.id}`, token, { fields: "permalink" }).catch(() => ({ permalink: undefined }));
  return { externalId: pub.id, url: link.permalink ?? null };
}

export async function publishFacebook(pageId: string, token: string, input: PublishInput, f: Fetch = fetch): Promise<PublishResult> {
  const { media, caption } = input;
  if (!media.length) throw new MetaError("Envie o arquivo final do post antes de publicar.");
  if (input.format === "story") throw new MetaError("Story no Facebook ainda não sai pelo KBOS; publique no app.");
  let id: string;
  if (media.length === 1 && media[0].kind === "video") {
    id = (await graph<{ id: string }>(f, "POST", `/${pageId}/videos`, token, { file_url: media[0].url, description: caption })).id;
  } else if (media.length === 1) {
    const r = await graph<{ id: string; post_id?: string }>(f, "POST", `/${pageId}/photos`, token, { url: media[0].url, message: caption });
    id = r.post_id ?? r.id;
  } else {
    if (media.some((m) => m.kind === "video")) throw new MetaError("No Facebook, várias mídias juntas só com fotos.");
    const ids: string[] = [];
    for (const m of media) ids.push((await graph<{ id: string }>(f, "POST", `/${pageId}/photos`, token, { url: m.url, published: false })).id);
    const attached: Record<string, string> = {};
    ids.forEach((x, i) => { attached[`attached_media[${i}]`] = JSON.stringify({ media_fbid: x }); });
    id = (await graph<{ id: string }>(f, "POST", `/${pageId}/feed`, token, { message: caption, ...attached })).id;
  }
  const link = await graph<{ permalink_url?: string }>(f, "GET", `/${id}`, token, { fields: "permalink_url" }).catch(() => ({ permalink_url: undefined }));
  return { externalId: id, url: link.permalink_url ?? null };
}
