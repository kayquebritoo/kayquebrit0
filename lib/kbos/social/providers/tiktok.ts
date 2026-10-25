// TikTok: Login Kit (OAuth v2, PKCE com desafio em hexadecimal, como o TikTok pede) + Content Posting API.
// Antes da auditoria do app o TikTok só deixa postar como "Só eu" (SELF_ONLY); com TIKTOK_AUDITED=1 sai público.
// O TikTok baixa o arquivo do nosso link público (PULL_FROM_URL): o domínio precisa estar verificado no app.
import { expiresIn, form, SocialError, type Fetch, type SocialProvider, type Tokens } from "../types";

const API = "https://open.tiktokapis.com/v2";
const key = () => (process.env.TIKTOK_CLIENT_KEY || "").trim();
const secret = () => (process.env.TIKTOK_CLIENT_SECRET || "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O TikTok sempre manda `error`; só é erro quando o código não é "ok" (ou no formato OAuth). */
async function tt<T>(res: Response): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } | string; error_description?: string } & T;
  const e = j.error;
  if (typeof e === "string") throw new SocialError(j.error_description || e, e, e === "invalid_grant");
  if (!res.ok || (e && e.code && e.code !== "ok")) {
    const code = (typeof e === "object" && e?.code) || res.status;
    throw new SocialError((typeof e === "object" && e?.message) || `O TikTok respondeu ${res.status}.`, code, code === "access_token_invalid" || res.status === 401);
  }
  return j;
}

type TokenRes = { access_token: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string };
const toTokens = (r: TokenRes): Tokens => ({ accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: expiresIn(r.expires_in), refreshExpiresAt: expiresIn(r.refresh_expires_in), scopes: r.scope?.split(","), externalUserId: r.open_id ?? null });
const json = (token: string, body: unknown) => ({ method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
const tokenCall = async (f: Fetch, body: Record<string, string | undefined>) =>
  toTokens(await tt<TokenRes>(await f(`${API}/oauth/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(body), signal: AbortSignal.timeout(20_000) })));

export const tiktokProvider: SocialProvider = {
  id: "tiktok",
  label: "TikTok",
  networks: ["tiktok"],
  scopes: ["user.info.basic", "video.publish"],
  pkce: "hex",
  canPublish: true,
  configured: () => key().length >= 8 && secret().length >= 16,
  authUrl({ redirectUri, state, codeChallenge }) {
    const qs = form({ client_key: key(), response_type: "code", scope: tiktokProvider.scopes.join(","), redirect_uri: redirectUri, state, code_challenge: codeChallenge, code_challenge_method: codeChallenge ? "S256" : undefined });
    return `https://www.tiktok.com/v2/auth/authorize/?${qs}`;
  },
  exchangeCode: ({ code, redirectUri, codeVerifier }, f = fetch) => tokenCall(f, { client_key: key(), client_secret: secret(), code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: codeVerifier }),
  refresh: (refreshToken, f = fetch) => tokenCall(f, { client_key: key(), client_secret: secret(), grant_type: "refresh_token", refresh_token: refreshToken }),
  async listAccounts(t, f = fetch) {
    const r = await tt<{ data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } } }>(await f(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { authorization: `Bearer ${t.accessToken}` }, signal: AbortSignal.timeout(20_000) }));
    const u = r.data?.user;
    const id = u?.open_id || t.externalUserId;
    return id ? [{ network: "tiktok", externalId: id, name: u?.display_name || "TikTok", username: null, pictureUrl: u?.avatar_url ?? null }] : [];
  },
  async revoke(token, f = fetch) {
    await tt(await f(`${API}/oauth/revoke/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_key: key(), client_secret: secret(), token }), signal: AbortSignal.timeout(15_000) }));
    return true;
  },
  async publish(_network, acc, input, f = fetch) {
    if (!input.media.length) throw new SocialError("Envie o arquivo final do post antes de publicar.");
    const info = await tt<{ data?: { privacy_level_options?: string[] } }>(await f(`${API}/post/publish/creator_info/query/`, json(acc.token, {})));
    const options = info.data?.privacy_level_options ?? [];
    const audited = process.env.TIKTOK_AUDITED === "1";
    const privacy = audited && options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
    const title = input.caption.slice(0, 2200);
    const videos = input.media.filter((m) => m.kind === "video");
    let init;
    if (videos.length) {
      if (input.media.length > 1) throw new SocialError("No TikTok sai um vídeo por post (ou só fotos, até 35).");
      init = await tt<{ data?: { publish_id?: string } }>(await f(`${API}/post/publish/video/init/`, json(acc.token, { post_info: { title, privacy_level: privacy }, source_info: { source: "PULL_FROM_URL", video_url: videos[0].url } })));
    } else {
      init = await tt<{ data?: { publish_id?: string } }>(await f(`${API}/post/publish/content/init/`, json(acc.token, {
        post_mode: "DIRECT_POST", media_type: "PHOTO",
        post_info: { title: title.split("\n")[0].slice(0, 90), description: title, privacy_level: privacy },
        source_info: { source: "PULL_FROM_URL", photo_images: input.media.slice(0, 35).map((m) => m.url), photo_cover_index: 0 },
      })));
    }
    const id = init.data?.publish_id;
    if (!id) throw new SocialError("O TikTok não devolveu o envio.");
    // O TikTok baixa e processa em segundo plano: espera um pouco pelo resultado; se demorar, conta como enviado.
    for (let i = 0; i < 12; i++) {
      const s = await tt<{ data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(await f(`${API}/post/publish/status/fetch/`, json(acc.token, { publish_id: id })));
      if (s.data?.status === "FAILED") throw new SocialError(`O TikTok recusou o post (${s.data.fail_reason || "sem motivo"}).`);
      if (s.data?.status === "PUBLISH_COMPLETE") {
        const post = s.data.publicaly_available_post_id?.[0];
        return { externalId: String(post ?? id), url: post ? `https://www.tiktok.com/video/${post}` : null };
      }
      await sleep(5000);
    }
    return { externalId: id, url: null };
  },
};
