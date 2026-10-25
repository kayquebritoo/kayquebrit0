// LinkedIn: "Sign In with LinkedIn (OpenID)" + "Share on LinkedIn" (w_member_social) para postar no perfil.
// PKCE no LinkedIn só existe para apps nativos; no web vale state assinado + segredo no servidor.
// Páginas de empresa (w_organization_social) exigem o produto Community Management API (revisão do LinkedIn).
import { expiresIn, form, readJson, SocialError, type Fetch, type SocialProvider, type Tokens } from "../types";

const id = () => (process.env.LINKEDIN_CLIENT_ID || "").trim();
const secret = () => (process.env.LINKEDIN_CLIENT_SECRET || "").trim();
const version = () => (process.env.LINKEDIN_VERSION || "202506").trim();

type TokenRes = { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string };
const toTokens = (r: TokenRes): Tokens => ({ accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: expiresIn(r.expires_in), refreshExpiresAt: expiresIn(r.refresh_token_expires_in), scopes: r.scope?.split(/[ ,]/) });
const tokenCall = async (f: Fetch, body: Record<string, string | undefined>) =>
  toTokens(await readJson<TokenRes>(await f("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form(body), signal: AbortSignal.timeout(20_000) }), "O LinkedIn"));
const rest = (token: string) => ({ authorization: `Bearer ${token}`, "linkedin-version": version(), "x-restli-protocol-version": "2.0.0", "content-type": "application/json" });
/** O texto do post usa o formato "little text": esses caracteres precisam de barra antes. */
export const linkedinEscape = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

export const linkedinProvider: SocialProvider = {
  id: "linkedin",
  label: "LinkedIn",
  networks: ["linkedin"],
  scopes: ["openid", "profile", "w_member_social"],
  pkce: false,
  canPublish: true,
  configured: () => id().length >= 6 && secret().length >= 10,
  authUrl: ({ redirectUri, state }) => `https://www.linkedin.com/oauth/v2/authorization?${form({ response_type: "code", client_id: id(), redirect_uri: redirectUri, state, scope: linkedinProvider.scopes.join(" ") })}`,
  exchangeCode: ({ code, redirectUri }, f = fetch) => tokenCall(f, { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: id(), client_secret: secret() }),
  refresh: (refreshToken, f = fetch) => tokenCall(f, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: id(), client_secret: secret() }),
  async listAccounts(t, f = fetch) {
    const me = await readJson<{ sub: string; name?: string; picture?: string }>(await f("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${t.accessToken}` }, signal: AbortSignal.timeout(20_000) }), "O LinkedIn");
    return [{ network: "linkedin", externalId: `urn:li:person:${me.sub}`, name: me.name || "Perfil do LinkedIn", username: null, pictureUrl: me.picture ?? null }];
  },
  async revoke(token, f = fetch) {
    const res = await f("https://www.linkedin.com/oauth/v2/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ client_id: id(), client_secret: secret(), token }), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) await readJson(res, "O LinkedIn");
    return true;
  },
  async publish(_network, acc, input, f = fetch) {
    if (input.media.some((m) => m.kind === "video")) throw new SocialError("No LinkedIn o KBOS publica texto com imagens por enquanto (vídeo ainda não).");
    const images: string[] = [];
    for (const m of input.media.slice(0, 20)) {
      const init = await readJson<{ value: { uploadUrl: string; image: string } }>(await f("https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST", headers: rest(acc.token), body: JSON.stringify({ initializeUploadRequest: { owner: acc.externalId } }), signal: AbortSignal.timeout(20_000) }), "O LinkedIn");
      const src = await f(m.url, { signal: AbortSignal.timeout(60_000) });
      if (!src.ok) throw new Error(`Não consegui ler o arquivo do post (${src.status}).`);
      const up = await f(init.value.uploadUrl, { method: "PUT", headers: { authorization: `Bearer ${acc.token}`, "content-type": "application/octet-stream" }, body: await src.arrayBuffer(), signal: AbortSignal.timeout(120_000) });
      if (!up.ok) await readJson(up, "O LinkedIn");
      images.push(init.value.image);
    }
    const content = images.length === 1 ? { media: { id: images[0] } } : images.length > 1 ? { multiImage: { images: images.map((x) => ({ id: x })) } } : undefined;
    const res = await f("https://api.linkedin.com/rest/posts", {
      method: "POST", headers: rest(acc.token), signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ author: acc.externalId, commentary: linkedinEscape(input.caption.slice(0, 3000)), visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, ...(content ? { content } : {}), lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }),
    });
    if (!res.ok) await readJson(res, "O LinkedIn");
    const urn = res.headers.get("x-restli-id") || "";
    if (!urn) throw new SocialError("O LinkedIn não devolveu o post.");
    return { externalId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  },
};
