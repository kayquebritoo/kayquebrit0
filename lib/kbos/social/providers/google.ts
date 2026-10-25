// Google: YouTube (canal) e Perfil da Empresa no Google. Mesmo cliente OAuth (GOOGLE_SOCIAL_CLIENT_ID), um login
// por produto para pedir só o escopo de cada um. PKCE S256 + refresh token (access_type=offline).
import { expiresIn, form, readJson, SocialError, type Fetch, type ProviderId, type SocialProvider, type Tokens } from "../types";

const clientId = () => (process.env.GOOGLE_SOCIAL_CLIENT_ID || "").trim();
const clientSecret = () => (process.env.GOOGLE_SOCIAL_CLIENT_SECRET || "").trim();
const configured = () => clientId().endsWith(".apps.googleusercontent.com") && clientSecret().length >= 10;

type TokenRes = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
const toTokens = (r: TokenRes): Tokens => ({ accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: expiresIn(r.expires_in), scopes: r.scope?.split(" ") });

function googleBase(id: ProviderId, scopes: string[]) {
  return {
    id,
    scopes,
    pkce: "S256" as const,
    configured,
    authUrl({ redirectUri, state, codeChallenge }: { redirectUri: string; state: string; codeChallenge?: string }) {
      const qs = form({ client_id: clientId(), redirect_uri: redirectUri, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined });
      return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
    },
    async exchangeCode({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string }, f: Fetch = fetch) {
      const res = await f("https://oauth2.googleapis.com/token", { method: "POST", body: form({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: codeVerifier }), signal: AbortSignal.timeout(20_000) });
      return toTokens(await readJson<TokenRes>(res, "O Google"));
    },
    async refresh(refreshToken: string, f: Fetch = fetch) {
      const res = await f("https://oauth2.googleapis.com/token", { method: "POST", body: form({ refresh_token: refreshToken, client_id: clientId(), client_secret: clientSecret(), grant_type: "refresh_token" }), signal: AbortSignal.timeout(20_000) });
      return toTokens(await readJson<TokenRes>(res, "O Google"));
    },
    async revoke(token: string, f: Fetch = fetch) {
      const res = await f("https://oauth2.googleapis.com/revoke", { method: "POST", body: form({ token }), signal: AbortSignal.timeout(15_000) });
      // 400 invalid_token = já estava revogado: para nós dá no mesmo
      if (!res.ok && res.status !== 400) throw new SocialError(`O Google respondeu ${res.status} ao revogar.`);
      return true;
    },
  };
}

const bearer = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });
const titleOf = (caption: string) => (caption.split("\n").map((l) => l.trim()).find(Boolean) || "Novo vídeo").replace(/[<>]/g, "").slice(0, 100);

export const youtubeProvider: SocialProvider = {
  ...googleBase("youtube", ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]),
  label: "YouTube",
  networks: ["youtube"],
  canPublish: true,
  async listAccounts(t, f = fetch) {
    const res = await f("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: bearer(t.accessToken), signal: AbortSignal.timeout(20_000) });
    const r = await readJson<{ items?: { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] }>(res, "O YouTube");
    return (r.items ?? []).map((c) => ({ network: "youtube", externalId: c.id, name: c.snippet?.title || "Canal", username: c.snippet?.customUrl?.replace(/^@/, "") ?? null, pictureUrl: c.snippet?.thumbnails?.default?.url ?? null }));
  },
  /** Envio retomável: cria a sessão com os dados do vídeo e manda o arquivo (em fluxo, sem carregar tudo na memória). */
  async publish(_network, acc, input, f = fetch) {
    const video = input.media.find((m) => m.kind === "video");
    if (!video || input.media.length !== 1) throw new SocialError("No YouTube sai um vídeo por post (MP4).");
    const src = await f(video.url, { signal: AbortSignal.timeout(60_000) });
    if (!src.ok || !src.body) throw new Error(`Não consegui ler o arquivo do post (${src.status}).`);
    const size = src.headers.get("content-length") || "";
    const meta = { snippet: { title: titleOf(input.caption), description: input.caption.slice(0, 5000), categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } };
    const init = await f("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST", headers: bearer(acc.token, { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": src.headers.get("content-type") || "video/mp4", ...(size ? { "x-upload-content-length": size } : {}) }), body: JSON.stringify(meta), signal: AbortSignal.timeout(30_000),
    });
    if (!init.ok) await readJson(init, "O YouTube");
    const location = init.headers.get("location");
    if (!location) throw new SocialError("O YouTube não abriu o envio do vídeo.");
    const up = await f(location, { method: "PUT", headers: { "content-type": src.headers.get("content-type") || "video/mp4", ...(size ? { "content-length": size } : {}) }, body: src.body, duplex: "half", signal: AbortSignal.timeout(30 * 60_000) } as RequestInit);
    const done = await readJson<{ id: string }>(up, "O YouTube");
    return { externalId: done.id, url: `https://youtu.be/${done.id}` };
  },
};

export const googleBusinessProvider: SocialProvider = {
  ...googleBase("google", ["https://www.googleapis.com/auth/business.manage"]),
  label: "Perfil da Empresa no Google",
  networks: ["google"],
  canPublish: true,
  async listAccounts(t, f = fetch) {
    const accRes = await f("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: bearer(t.accessToken), signal: AbortSignal.timeout(20_000) });
    const accounts = (await readJson<{ accounts?: { name: string; accountName?: string }[] }>(accRes, "O Google")).accounts ?? [];
    const out = [];
    for (const a of accounts.slice(0, 20)) {
      const locRes = await f(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, { headers: bearer(t.accessToken), signal: AbortSignal.timeout(20_000) });
      const locs = (await readJson<{ locations?: { name: string; title?: string }[] }>(locRes, "O Google")).locations ?? [];
      for (const l of locs) out.push({ network: "google", externalId: `${a.name}/${l.name}`, name: l.title || a.accountName || "Empresa", username: null, pictureUrl: null });
    }
    return out;
  },
  /** Novidade no perfil (texto + uma foto). Vídeo o Google não aceita por API em post. */
  async publish(_network, acc, input, f = fetch) {
    const photo = input.media.find((m) => m.kind === "image");
    if (!photo) throw new SocialError("No Perfil da Empresa o post precisa de uma foto (JPG).");
    const res = await f(`https://mybusiness.googleapis.com/v4/${acc.externalId}/localPosts`, {
      method: "POST", headers: bearer(acc.token, { "content-type": "application/json" }), signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ languageCode: "pt-BR", topicType: "STANDARD", summary: input.caption.slice(0, 1500), media: [{ mediaFormat: "PHOTO", sourceUrl: photo.url }] }),
    });
    const r = await readJson<{ name: string; searchUrl?: string }>(res, "O Google");
    return { externalId: r.name, url: r.searchUrl ?? null };
  },
};
