// Pinterest: OAuth v5 (segredo do app no servidor; o fluxo web do Pinterest não usa PKCE). Cada pasta (board)
// vira uma conta onde o KBOS cria Pins de imagem. Vídeo pede o envio em partes do Pinterest (fica para depois).
import { expiresIn, form, readJson, SocialError, type Fetch, type SocialProvider, type Tokens } from "../types";

const API = "https://api.pinterest.com/v5";
const id = () => (process.env.PINTEREST_APP_ID || "").trim();
const secret = () => (process.env.PINTEREST_APP_SECRET || "").trim();
const basic = () => `Basic ${Buffer.from(`${id()}:${secret()}`).toString("base64")}`;

type TokenRes = { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string };
const toTokens = (r: TokenRes): Tokens => ({ accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresAt: expiresIn(r.expires_in), refreshExpiresAt: expiresIn(r.refresh_token_expires_in), scopes: r.scope?.split(/[ ,]/) });
const tokenCall = async (f: Fetch, body: Record<string, string | undefined>) =>
  toTokens(await readJson<TokenRes>(await f(`${API}/oauth/token`, { method: "POST", headers: { authorization: basic(), "content-type": "application/x-www-form-urlencoded" }, body: form(body), signal: AbortSignal.timeout(20_000) }), "O Pinterest"));
const get = async <T,>(f: Fetch, path: string, token: string) => readJson<T>(await f(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }), "O Pinterest");

export const pinterestProvider: SocialProvider = {
  id: "pinterest",
  label: "Pinterest",
  networks: ["pinterest"],
  scopes: ["user_accounts:read", "boards:read", "pins:read", "pins:write"],
  pkce: false,
  canPublish: true,
  configured: () => id().length >= 4 && secret().length >= 16,
  authUrl: ({ redirectUri, state }) => `https://www.pinterest.com/oauth/?${form({ client_id: id(), redirect_uri: redirectUri, response_type: "code", scope: pinterestProvider.scopes.join(","), state })}`,
  exchangeCode: ({ code, redirectUri }, f = fetch) => tokenCall(f, { grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  refresh: (refreshToken, f = fetch) => tokenCall(f, { grant_type: "refresh_token", refresh_token: refreshToken }),
  async listAccounts(t, f = fetch) {
    const user = await get<{ username?: string; profile_image?: string }>(f, "/user_account", t.accessToken);
    const boards = await get<{ items?: { id: string; name: string }[] }>(f, "/boards?page_size=100", t.accessToken);
    return (boards.items ?? []).map((b) => ({ network: "pinterest", externalId: b.id, name: b.name, username: user.username ?? null, pictureUrl: user.profile_image ?? null }));
  },
  // O Pinterest não tem revogação por API: o cliente remove o app em Configurações → Apps (o KBOS apaga o token daqui).
  revoke: async () => false,
  async publish(_network, acc, input, f = fetch) {
    const imgs = input.media.filter((m) => m.kind === "image");
    if (!imgs.length || imgs.length !== input.media.length) throw new SocialError("No Pinterest o KBOS publica só imagens (JPG) por enquanto.");
    const media_source = imgs.length === 1 ? { source_type: "image_url", url: imgs[0].url } : { source_type: "multiple_image_urls", items: imgs.slice(0, 5).map((m) => ({ url: m.url })) };
    const title = (input.caption.split("\n").find((l) => l.trim()) || "").trim().slice(0, 100);
    const res = await f(`${API}/pins`, { method: "POST", headers: { authorization: `Bearer ${acc.token}`, "content-type": "application/json" }, body: JSON.stringify({ board_id: acc.externalId, title, description: input.caption.slice(0, 500), media_source }), signal: AbortSignal.timeout(30_000) });
    const pin = await readJson<{ id: string }>(res, "O Pinterest");
    return { externalId: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` };
  },
};
