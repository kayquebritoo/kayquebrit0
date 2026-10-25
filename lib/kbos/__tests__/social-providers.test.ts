import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Chaves de teste (as funções dos provedores leem o ambiente na hora do uso).
vi.hoisted(() => {
  Object.assign(process.env, {
    META_APP_ID: "12345", META_APP_SECRET: "segredo-meta-de-teste-123456",
    GOOGLE_SOCIAL_CLIENT_ID: "abc123.apps.googleusercontent.com", GOOGLE_SOCIAL_CLIENT_SECRET: "google-secret-123456",
    TIKTOK_CLIENT_KEY: "tiktokkey123", TIKTOK_CLIENT_SECRET: "tiktok-secret-1234567890",
    PINTEREST_APP_ID: "pin1234", PINTEREST_APP_SECRET: "pinterest-secret-1234567",
    LINKEDIN_CLIENT_ID: "linkedin123", LINKEDIN_CLIENT_SECRET: "linkedin-secret-123",
    SOCIAL_TOKEN_KEY: "0123456789abcdef".repeat(4), APP_URL: "https://kbos.test",
  });
  delete process.env.TIKTOK_AUDITED;
});

import { seal, unseal, socialCryptoReady } from "../social-crypto";
import { SocialError, readJson } from "../social/types";
import { finishFlow, pkcePair, redirectUriFor, safeBack, startFlow, type FlowTarget } from "../social/oauth";
import { PROVIDERS, PUBLISH_NETWORKS, providerById, providerForNetwork } from "../social/providers";
import { googleBusinessProvider, youtubeProvider } from "../social/providers/google";
import { linkedinEscape, linkedinProvider } from "../social/providers/linkedin";
import { metaProvider } from "../social/providers/meta";
import { pinterestProvider } from "../social/providers/pinterest";
import { tiktokProvider } from "../social/providers/tiktok";

type Call = { method: string; url: string; host: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: unknown };
type Route = (c: Call) => Response | object;
const jres = (o: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers });

/** Rede de mentira: roteia por "MÉTODO host/caminho" e guarda cada chamada. Rota não prevista = erro. */
function fakeNet(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    const b = init?.body;
    const call: Call = { method: init?.method ?? "GET", url: String(input), host: u.host, path: u.pathname, query: u.searchParams, headers, body: b instanceof URLSearchParams ? b.toString() : b };
    calls.push(call);
    const key = Object.keys(routes).find((k) => k === `${call.method} ${call.host}${call.path}`) ?? Object.keys(routes).find((k) => new RegExp(`^${k.replace(/:\w+/g, "[^/]+")}$`).test(`${call.method} ${call.host}${call.path.replace(/^\/v[\d.]+/, "")}`));
    if (!key) throw new Error(`sem rota ${call.method} ${call.host}${call.path}`);
    const r = routes[key](call);
    return r instanceof Response ? r : jres(r);
  }) as typeof fetch;
  return { f, calls };
}
const form = (c: Call) => new URLSearchParams(String(c.body));
const noNet = (() => { throw new Error("não devia chamar a rede"); }) as unknown as typeof fetch;

afterEach(() => vi.unstubAllEnvs());

const REDIRECT = "https://kbos.test/api/social/x/callback/";
const ids = ["meta", "youtube", "google", "tiktok", "pinterest", "linkedin"] as const;
const keysOf: Record<(typeof ids)[number], string[]> = {
  meta: ["META_APP_ID"], youtube: ["GOOGLE_SOCIAL_CLIENT_ID"], google: ["GOOGLE_SOCIAL_CLIENT_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY"], pinterest: ["PINTEREST_APP_SECRET"], linkedin: ["LINKEDIN_CLIENT_ID"],
};

describe("configuração (Em breve sem chaves)", () => {
  for (const id of ids) {
    it(`${id}: configurado com as chaves e desligado sem elas`, () => {
      const p = providerById(id)!;
      expect(p.configured()).toBe(true);
      for (const k of keysOf[id]) vi.stubEnv(k, "");
      expect(p.configured()).toBe(false);
    });
  }
  it("Google exige client id terminado em .apps.googleusercontent.com", () => {
    vi.stubEnv("GOOGLE_SOCIAL_CLIENT_ID", "qualquer-coisa");
    expect(youtubeProvider.configured()).toBe(false);
    expect(googleBusinessProvider.configured()).toBe(false);
  });
});

describe("authUrl", () => {
  const url = (p: ReturnType<typeof providerById>, challenge?: string) => new URL(p!.authUrl({ redirectUri: REDIRECT, state: "ST", codeChallenge: challenge }));

  it("Meta: dialog do Facebook com client_id, redirect, state e escopos, sem PKCE", () => {
    const u = url(metaProvider);
    expect(u.host).toBe("www.facebook.com");
    expect(u.pathname).toMatch(/\/dialog\/oauth$/);
    expect(u.searchParams.get("client_id")).toBe("12345");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("scope")!.split(",")).toEqual(metaProvider.scopes);
    expect(u.searchParams.has("code_challenge")).toBe(false);
    expect(metaProvider.pkce).toBe(false);
  });
  for (const p of [youtubeProvider, googleBusinessProvider]) {
    it(`${p.id}: Google com PKCE S256, access_type=offline e escopo próprio`, () => {
      const u = url(p, "CHAL");
      expect(u.host).toBe("accounts.google.com");
      expect(u.searchParams.get("client_id")).toBe("abc123.apps.googleusercontent.com");
      expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(u.searchParams.get("state")).toBe("ST");
      expect(u.searchParams.get("access_type")).toBe("offline");
      expect(u.searchParams.get("scope")!.split(" ")).toEqual(p.scopes);
      expect(u.searchParams.get("code_challenge")).toBe("CHAL");
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      expect(p.pkce).toBe("S256");
    });
  }
  it("Google: escopos separados (YouTube x Perfil da Empresa)", () => {
    expect(youtubeProvider.scopes.join(" ")).toMatch(/youtube\.upload/);
    expect(googleBusinessProvider.scopes).toEqual(["https://www.googleapis.com/auth/business.manage"]);
  });
  it("TikTok: client_key (não client_id), PKCE com method S256 e escopos por vírgula", () => {
    const u = url(tiktokProvider, "HEXCHAL");
    expect(u.host).toBe("www.tiktok.com");
    expect(u.searchParams.get("client_key")).toBe("tiktokkey123");
    expect(u.searchParams.has("client_id")).toBe(false);
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("scope")).toBe("user.info.basic,video.publish");
    expect(u.searchParams.get("code_challenge")).toBe("HEXCHAL");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(tiktokProvider.pkce).toBe("hex");
  });
  it("Pinterest: sem PKCE, escopos por vírgula", () => {
    const u = url(pinterestProvider);
    expect(u.host).toBe("www.pinterest.com");
    expect(u.searchParams.get("client_id")).toBe("pin1234");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("scope")).toBe("user_accounts:read,boards:read,pins:read,pins:write");
    expect(u.searchParams.has("code_challenge")).toBe(false);
    expect(pinterestProvider.pkce).toBe(false);
  });
  it("LinkedIn: sem PKCE, escopos por espaço (openid, profile, w_member_social)", () => {
    const u = url(linkedinProvider);
    expect(u.host).toBe("www.linkedin.com");
    expect(u.searchParams.get("client_id")).toBe("linkedin123");
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(u.searchParams.has("code_challenge")).toBe(false);
    expect(linkedinProvider.pkce).toBe(false);
  });
});

describe("exchangeCode", () => {
  it("Meta: troca por token curto e depois longo", async () => {
    const { f, calls } = fakeNet({
      "GET graph.facebook.com/oauth/access_token": (c) => (c.query.get("grant_type") ? { access_token: "LONG", expires_in: 5_000_000 } : { access_token: "SHORT" }),
    });
    const t = await metaProvider.exchangeCode({ code: "C", redirectUri: REDIRECT }, f);
    expect(t.accessToken).toBe("LONG");
    expect(t.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(calls).toHaveLength(2);
  });
  for (const p of [youtubeProvider, googleBusinessProvider]) {
    it(`${p.id}: endpoint do Google, code_verifier no corpo e mapeia access/refresh/expira`, async () => {
      const { f, calls } = fakeNet({ "POST oauth2.googleapis.com/token": () => ({ access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "a b" }) });
      const t = await p.exchangeCode({ code: "C", redirectUri: REDIRECT, codeVerifier: "VERIF" }, f);
      const b = form(calls[0]);
      expect(b.get("code_verifier")).toBe("VERIF");
      expect(b.get("code")).toBe("C");
      expect(b.get("grant_type")).toBe("authorization_code");
      expect(b.get("client_id")).toBe("abc123.apps.googleusercontent.com");
      expect(b.get("redirect_uri")).toBe(REDIRECT);
      expect(t).toMatchObject({ accessToken: "AT", refreshToken: "RT", scopes: ["a", "b"] });
      expect(t.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    });
  }
  it("TikTok: endpoint v2, client_key, code_verifier e open_id", async () => {
    const { f, calls } = fakeNet({ "POST open.tiktokapis.com/v2/oauth/token/": () => ({ access_token: "AT", refresh_token: "RT", expires_in: 86400, refresh_expires_in: 31536000, open_id: "OID", scope: "user.info.basic,video.publish" }) });
    const t = await tiktokProvider.exchangeCode({ code: "C", redirectUri: REDIRECT, codeVerifier: "VERIF" }, f);
    const b = form(calls[0]);
    expect(b.get("client_key")).toBe("tiktokkey123");
    expect(b.get("code_verifier")).toBe("VERIF");
    expect(b.get("grant_type")).toBe("authorization_code");
    expect(t).toMatchObject({ accessToken: "AT", refreshToken: "RT", externalUserId: "OID", scopes: ["user.info.basic", "video.publish"] });
    expect(t.refreshExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 30 * 86400_000);
  });
  it("Pinterest: autenticação Basic (id:segredo) e sem code_verifier", async () => {
    const { f, calls } = fakeNet({ "POST api.pinterest.com/v5/oauth/token": () => ({ access_token: "AT", refresh_token: "RT", expires_in: 2592000, refresh_token_expires_in: 31536000, scope: "boards:read,pins:write" }) });
    const t = await pinterestProvider.exchangeCode({ code: "C", redirectUri: REDIRECT, codeVerifier: "IGNORADO" }, f);
    expect(calls[0].headers.authorization).toBe(`Basic ${Buffer.from("pin1234:pinterest-secret-1234567").toString("base64")}`);
    expect(form(calls[0]).has("code_verifier")).toBe(false);
    expect(t).toMatchObject({ accessToken: "AT", refreshToken: "RT", scopes: ["boards:read", "pins:write"] });
    expect(t.refreshExpiresAt).toBeInstanceOf(Date);
  });
  it("LinkedIn: endpoint accessToken com client_id/secret no corpo", async () => {
    const { f, calls } = fakeNet({ "POST www.linkedin.com/oauth/v2/accessToken": () => ({ access_token: "AT", expires_in: 5184000, refresh_token: "RT", refresh_token_expires_in: 31536000, scope: "openid,profile,w_member_social" }) });
    const t = await linkedinProvider.exchangeCode({ code: "C", redirectUri: REDIRECT }, f);
    const b = form(calls[0]);
    expect(b.get("client_id")).toBe("linkedin123");
    expect(b.get("client_secret")).toBe("linkedin-secret-123");
    expect(b.get("grant_type")).toBe("authorization_code");
    expect(t).toMatchObject({ accessToken: "AT", refreshToken: "RT", scopes: ["openid", "profile", "w_member_social"] });
  });
});

describe("refresh", () => {
  it("Google: grant refresh_token e mapeia o novo access token (mantém refresh ausente como null)", async () => {
    const { f, calls } = fakeNet({ "POST oauth2.googleapis.com/token": () => ({ access_token: "NEW", expires_in: 3600 }) });
    const t = await youtubeProvider.refresh!("RT", f);
    expect(form(calls[0]).get("grant_type")).toBe("refresh_token");
    expect(form(calls[0]).get("refresh_token")).toBe("RT");
    expect(t.accessToken).toBe("NEW");
    expect(t.refreshToken).toBeNull();
    expect(t.expiresAt).toBeInstanceOf(Date);
  });
  it("TikTok: devolve também o refresh token novo", async () => {
    const { f, calls } = fakeNet({ "POST open.tiktokapis.com/v2/oauth/token/": () => ({ access_token: "NEW", refresh_token: "RT2", expires_in: 86400 }) });
    const t = await tiktokProvider.refresh!("RT", f);
    expect(form(calls[0])).toSatisfy((b: URLSearchParams) => b.get("grant_type") === "refresh_token" && b.get("refresh_token") === "RT" && b.get("client_key") === "tiktokkey123");
    expect(t).toMatchObject({ accessToken: "NEW", refreshToken: "RT2" });
  });
  it("Pinterest: Basic auth e grant refresh_token", async () => {
    const { f, calls } = fakeNet({ "POST api.pinterest.com/v5/oauth/token": () => ({ access_token: "NEW", expires_in: 100 }) });
    const t = await pinterestProvider.refresh!("RT", f);
    expect(calls[0].headers.authorization).toMatch(/^Basic /);
    expect(form(calls[0]).get("grant_type")).toBe("refresh_token");
    expect(t.accessToken).toBe("NEW");
  });
  it("LinkedIn: grant refresh_token", async () => {
    const { f, calls } = fakeNet({ "POST www.linkedin.com/oauth/v2/accessToken": () => ({ access_token: "NEW", expires_in: 100 }) });
    const t = await linkedinProvider.refresh!("RT", f);
    expect(form(calls[0]).get("refresh_token")).toBe("RT");
    expect(t.accessToken).toBe("NEW");
  });
  it("Meta não renova (sem refresh)", () => {
    expect(metaProvider.refresh).toBeUndefined();
  });
});

describe("listAccounts", () => {
  it("YouTube: canais do usuário", async () => {
    const { f, calls } = fakeNet({ "GET www.googleapis.com/youtube/v3/channels": () => ({ items: [{ id: "UC1", snippet: { title: "Canal do Kayque", customUrl: "@kayque", thumbnails: { default: { url: "https://img/1.jpg" } } } }] }) });
    const r = await youtubeProvider.listAccounts({ accessToken: "AT" }, f);
    expect(calls[0].headers.authorization).toBe("Bearer AT");
    expect(r).toEqual([{ network: "youtube", externalId: "UC1", name: "Canal do Kayque", username: "kayque", pictureUrl: "https://img/1.jpg" }]);
  });
  it("YouTube: sem canal devolve lista vazia", async () => {
    const { f } = fakeNet({ "GET www.googleapis.com/youtube/v3/channels": () => ({}) });
    expect(await youtubeProvider.listAccounts({ accessToken: "AT" }, f)).toEqual([]);
  });
  it("Google Business: contas + locais viram accounts/x/locations/y", async () => {
    const { f } = fakeNet({
      "GET mybusinessaccountmanagement.googleapis.com/v1/accounts": () => ({ accounts: [{ name: "accounts/x", accountName: "Conta X" }] }),
      "GET mybusinessbusinessinformation.googleapis.com/v1/accounts/x/locations": () => ({ locations: [{ name: "locations/y", title: "Hotel Atalaia" }, { name: "locations/z" }] }),
    });
    const r = await googleBusinessProvider.listAccounts({ accessToken: "AT" }, f);
    expect(r.map((a) => [a.network, a.externalId, a.name])).toEqual([["google", "accounts/x/locations/y", "Hotel Atalaia"], ["google", "accounts/x/locations/z", "Conta X"]]);
  });
  it("TikTok: error.code 'ok' NÃO é erro; lista o perfil", async () => {
    const { f } = fakeNet({ "GET open.tiktokapis.com/v2/user/info/": () => ({ data: { user: { open_id: "OID", display_name: "Kayque", avatar_url: "https://a/b.jpg" } }, error: { code: "ok", message: "", log_id: "1" } }) });
    const r = await tiktokProvider.listAccounts({ accessToken: "AT" }, f);
    expect(r).toEqual([{ network: "tiktok", externalId: "OID", name: "Kayque", username: null, pictureUrl: "https://a/b.jpg" }]);
  });
  it("TikTok: usa o open_id do login quando a rede não devolve perfil", async () => {
    const { f } = fakeNet({ "GET open.tiktokapis.com/v2/user/info/": () => ({ data: {}, error: { code: "ok" } }) });
    expect((await tiktokProvider.listAccounts({ accessToken: "AT", externalUserId: "LOGIN" }, f))[0].externalId).toBe("LOGIN");
    expect(await tiktokProvider.listAccounts({ accessToken: "AT" }, f)).toEqual([]);
  });
  it("TikTok: erro real (código diferente de ok) vira SocialError", async () => {
    const { f } = fakeNet({ "GET open.tiktokapis.com/v2/user/info/": () => jres({ error: { code: "scope_not_authorized", message: "sem escopo" } }, 403) });
    await expect(tiktokProvider.listAccounts({ accessToken: "AT" }, f)).rejects.toMatchObject({ message: "sem escopo", expired: false });
  });
  it("Pinterest: cada pasta (board) vira uma conta", async () => {
    const { f } = fakeNet({
      "GET api.pinterest.com/v5/user_account": () => ({ username: "kayque", profile_image: "https://p/i.jpg" }),
      "GET api.pinterest.com/v5/boards": () => ({ items: [{ id: "b1", name: "Hotel" }, { id: "b2", name: "Lounge" }] }),
    });
    const r = await pinterestProvider.listAccounts({ accessToken: "AT" }, f);
    expect(r.map((a) => [a.externalId, a.name, a.username])).toEqual([["b1", "Hotel", "kayque"], ["b2", "Lounge", "kayque"]]);
  });
  it("LinkedIn: userinfo vira urn:li:person:<sub>", async () => {
    const { f } = fakeNet({ "GET api.linkedin.com/v2/userinfo": () => ({ sub: "abc123", name: "Kayque Brito", picture: "https://l/p.jpg" }) });
    const r = await linkedinProvider.listAccounts({ accessToken: "AT" }, f);
    expect(r).toEqual([{ network: "linkedin", externalId: "urn:li:person:abc123", name: "Kayque Brito", username: null, pictureUrl: "https://l/p.jpg" }]);
  });
  it("Meta: Páginas e Instagram ligado", async () => {
    const { f } = fakeNet({ "GET graph.facebook.com/me/accounts": () => ({ data: [{ id: "p1", name: "Hotel", access_token: "PT1", instagram_business_account: { id: "ig1", username: "hotel" } }] }) });
    const r = await metaProvider.listAccounts({ accessToken: "U" }, f);
    expect(r.map((a) => [a.network, a.externalId, a.token])).toEqual([["facebook", "p1", "PT1"], ["instagram", "ig1", "PT1"]]);
  });
});

describe("revoke", () => {
  it("Google (YouTube e Perfil): chama /revoke com o token e devolve true; 400 também é ok", async () => {
    for (const p of [youtubeProvider, googleBusinessProvider]) {
      const { f, calls } = fakeNet({ "POST oauth2.googleapis.com/revoke": () => jres({}) });
      expect(await p.revoke("AT", f)).toBe(true);
      expect(form(calls[0]).get("token")).toBe("AT");
    }
    const { f: f400 } = fakeNet({ "POST oauth2.googleapis.com/revoke": () => jres({ error: "invalid_token" }, 400) });
    expect(await youtubeProvider.revoke("AT", f400)).toBe(true);
    const { f: f500 } = fakeNet({ "POST oauth2.googleapis.com/revoke": () => jres({}, 500) });
    await expect(youtubeProvider.revoke("AT", f500)).rejects.toBeInstanceOf(SocialError);
  });
  it("TikTok: chama /oauth/revoke/ (aceita error ok) e devolve true", async () => {
    const { f, calls } = fakeNet({ "POST open.tiktokapis.com/v2/oauth/revoke/": () => ({ error: { code: "ok" } }) });
    expect(await tiktokProvider.revoke("AT", f)).toBe(true);
    expect(form(calls[0]).get("token")).toBe("AT");
    expect(form(calls[0]).get("client_key")).toBe("tiktokkey123");
  });
  it("LinkedIn: chama /oauth/v2/revoke e devolve true", async () => {
    const { f, calls } = fakeNet({ "POST www.linkedin.com/oauth/v2/revoke": () => new Response(null, { status: 200 }) });
    expect(await linkedinProvider.revoke("AT", f)).toBe(true);
    expect(form(calls[0]).get("token")).toBe("AT");
  });
  it("Meta: DELETE /me/permissions e devolve true", async () => {
    const { f, calls } = fakeNet({ "DELETE graph.facebook.com/me/permissions": () => ({ success: true }) });
    expect(await metaProvider.revoke("U", f)).toBe(true);
    expect(calls[0].method).toBe("DELETE");
  });
  it("Pinterest: false sem tocar a rede (o cliente remove no app)", async () => {
    expect(await pinterestProvider.revoke("AT", noNet)).toBe(false);
  });
});

describe("publicar", () => {
  const acc = { externalId: "EXT", pageId: null, token: "AT" };
  const img = { kind: "image" as const, url: "https://kbos.test/m/foto.jpg" };
  const vid = { kind: "video" as const, url: "https://kbos.test/m/video.mp4" };

  it("YouTube: envio retomável (POST abre a sessão, PUT manda o arquivo) e devolve youtu.be", async () => {
    const { f, calls } = fakeNet({
      "GET kbos.test/m/video.mp4": () => new Response("bytes-do-video", { headers: { "content-type": "video/mp4" } }),
      "POST www.googleapis.com/upload/youtube/v3/videos": () => new Response("{}", { status: 200, headers: { location: "https://upload.youtube.test/sessao/1" } }),
      "PUT upload.youtube.test/sessao/1": () => ({ id: "VID123" }),
    });
    const r = await youtubeProvider.publish!("youtube", acc, { format: "reels", caption: "Título <legal>\nresto", media: [vid] }, f);
    expect(r).toEqual({ externalId: "VID123", url: "https://youtu.be/VID123" });
    const init = calls[1];
    expect(init.method).toBe("POST");
    expect(init.query.get("uploadType")).toBe("resumable");
    expect(init.headers.authorization).toBe("Bearer AT");
    const meta = JSON.parse(String(init.body));
    expect(meta.snippet.title).toBe("Título legal");
    expect(meta.status.privacyStatus).toBe("public");
    expect(calls[2].method).toBe("PUT");
    expect(calls[2].url).toBe("https://upload.youtube.test/sessao/1");
  });
  it("YouTube: recusa imagem e mais de um arquivo; sem location dá erro", async () => {
    await expect(youtubeProvider.publish!("youtube", acc, { format: "estatico", caption: "x", media: [img] }, noNet)).rejects.toBeInstanceOf(SocialError);
    await expect(youtubeProvider.publish!("youtube", acc, { format: "reels", caption: "x", media: [vid, vid] }, noNet)).rejects.toThrow(/um vídeo por post/);
    const { f } = fakeNet({
      "GET kbos.test/m/video.mp4": () => new Response("v"),
      "POST www.googleapis.com/upload/youtube/v3/videos": () => jres({}),
    });
    await expect(youtubeProvider.publish!("youtube", acc, { format: "reels", caption: "x", media: [vid] }, f)).rejects.toThrow(/não abriu o envio/);
  });
  it("Google Business: localPost com foto", async () => {
    const { f, calls } = fakeNet({ "POST mybusiness.googleapis.com/v4/accounts/x/locations/y/localPosts": () => ({ name: "accounts/x/locations/y/localPosts/9", searchUrl: "https://g.page/p/9" }) });
    const r = await googleBusinessProvider.publish!("google", { ...acc, externalId: "accounts/x/locations/y" }, { format: "estatico", caption: "Promo", media: [img] }, f);
    expect(r).toEqual({ externalId: "accounts/x/locations/y/localPosts/9", url: "https://g.page/p/9" });
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ summary: "Promo", topicType: "STANDARD", media: [{ mediaFormat: "PHOTO", sourceUrl: img.url }] });
    await expect(googleBusinessProvider.publish!("google", acc, { format: "reels", caption: "x", media: [vid] }, noNet)).rejects.toThrow(/foto/);
  });
  it("TikTok: vídeo PULL_FROM_URL como SELF_ONLY sem auditoria; PUBLISH_COMPLETE no primeiro status", async () => {
    const mk = () => fakeNet({
      "POST open.tiktokapis.com/v2/post/publish/creator_info/query/": () => ({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/video/init/": () => ({ data: { publish_id: "PUB1" }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/status/fetch/": () => ({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [777] }, error: { code: "ok" } }),
    });
    const a = mk();
    const r = await tiktokProvider.publish!("tiktok", acc, { format: "reels", caption: "Oi", media: [vid] }, a.f);
    expect(r).toEqual({ externalId: "777", url: "https://www.tiktok.com/video/777" });
    const init = JSON.parse(String(a.calls[1].body));
    expect(init.post_info.privacy_level).toBe("SELF_ONLY");
    expect(init.source_info).toEqual({ source: "PULL_FROM_URL", video_url: vid.url });
    expect(a.calls).toHaveLength(3);

    vi.stubEnv("TIKTOK_AUDITED", "1");
    const b = mk();
    await tiktokProvider.publish!("tiktok", acc, { format: "reels", caption: "Oi", media: [vid] }, b.f);
    expect(JSON.parse(String(b.calls[1].body)).post_info.privacy_level).toBe("PUBLIC_TO_EVERYONE");
  });
  it("TikTok: auditado mas conta sem opção pública continua SELF_ONLY; fotos usam content/init", async () => {
    vi.stubEnv("TIKTOK_AUDITED", "1");
    const { f, calls } = fakeNet({
      "POST open.tiktokapis.com/v2/post/publish/creator_info/query/": () => ({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/content/init/": () => ({ data: { publish_id: "PUB2" }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/status/fetch/": () => ({ data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok" } }),
    });
    const r = await tiktokProvider.publish!("tiktok", acc, { format: "carrossel", caption: "Fotos", media: [img, img] }, f);
    expect(r).toEqual({ externalId: "PUB2", url: null });
    const body = JSON.parse(String(calls[1].body));
    expect(body.media_type).toBe("PHOTO");
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
    expect(body.source_info.photo_images).toEqual([img.url, img.url]);
  });
  it("TikTok: status FAILED lança SocialError; sem mídia e vídeo + outro arquivo também", async () => {
    const { f } = fakeNet({
      "POST open.tiktokapis.com/v2/post/publish/creator_info/query/": () => ({ data: { privacy_level_options: [] }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/video/init/": () => ({ data: { publish_id: "PUB3" }, error: { code: "ok" } }),
      "POST open.tiktokapis.com/v2/post/publish/status/fetch/": () => ({ data: { status: "FAILED", fail_reason: "file_format_check_failed" }, error: { code: "ok" } }),
    });
    const e = await tiktokProvider.publish!("tiktok", acc, { format: "reels", caption: "x", media: [vid] }, f).then(() => undefined as never, (x: SocialError) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.message).toMatch(/file_format_check_failed/);
    await expect(tiktokProvider.publish!("tiktok", acc, { format: "reels", caption: "x", media: [] }, noNet)).rejects.toBeInstanceOf(SocialError);
    await expect(tiktokProvider.publish!("tiktok", acc, { format: "reels", caption: "x", media: [vid, img] }, f)).rejects.toThrow(/um vídeo por post/);
  });
  it("Pinterest: pin de imagem na pasta (board)", async () => {
    const { f, calls } = fakeNet({ "POST api.pinterest.com/v5/pins": () => ({ id: "PIN1" }) });
    const r = await pinterestProvider.publish!("pinterest", { ...acc, externalId: "board9" }, { format: "estatico", caption: "Título\ndescrição", media: [img] }, f);
    expect(r).toEqual({ externalId: "PIN1", url: "https://www.pinterest.com/pin/PIN1/" });
    expect(calls[0].headers.authorization).toBe("Bearer AT");
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ board_id: "board9", title: "Título", media_source: { source_type: "image_url", url: img.url } });
  });
  it("Pinterest: várias imagens viram multiple_image_urls; vídeo é recusado", async () => {
    const { f, calls } = fakeNet({ "POST api.pinterest.com/v5/pins": () => ({ id: "PIN2" }) });
    await pinterestProvider.publish!("pinterest", acc, { format: "carrossel", caption: "x", media: [img, img] }, f);
    expect(JSON.parse(String(calls[0].body)).media_source.source_type).toBe("multiple_image_urls");
    await expect(pinterestProvider.publish!("pinterest", acc, { format: "reels", caption: "x", media: [vid] }, noNet)).rejects.toBeInstanceOf(SocialError);
    await expect(pinterestProvider.publish!("pinterest", acc, { format: "reels", caption: "x", media: [] }, noNet)).rejects.toBeInstanceOf(SocialError);
  });
  it("LinkedIn: imagem (initializeUpload, PUT, posts) lendo x-restli-id", async () => {
    const { f, calls } = fakeNet({
      "POST api.linkedin.com/rest/images": () => ({ value: { uploadUrl: "https://upload.linkedin.test/u1", image: "urn:li:image:IMG1" } }),
      "GET kbos.test/m/foto.jpg": () => new Response(new Uint8Array([1, 2, 3])),
      "PUT upload.linkedin.test/u1": () => new Response(null, { status: 201 }),
      "POST api.linkedin.com/rest/posts": () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:555" } }),
    });
    const r = await linkedinProvider.publish!("linkedin", { ...acc, externalId: "urn:li:person:abc" }, { format: "estatico", caption: "Olá #kbos (teste)", media: [img] }, f);
    expect(r).toEqual({ externalId: "urn:li:share:555", url: "https://www.linkedin.com/feed/update/urn:li:share:555/" });
    expect(calls.map((c) => `${c.method} ${c.host}${c.path}`)).toEqual([
      "POST api.linkedin.com/rest/images", "GET kbos.test/m/foto.jpg", "PUT upload.linkedin.test/u1", "POST api.linkedin.com/rest/posts",
    ]);
    expect(calls[0].query.get("action")).toBe("initializeUpload");
    expect(calls[0].headers["linkedin-version"]).toBeTruthy();
    expect(JSON.parse(String(calls[0].body)).initializeUploadRequest.owner).toBe("urn:li:person:abc");
    const post = JSON.parse(String(calls[3].body));
    expect(post.author).toBe("urn:li:person:abc");
    expect(post.commentary).toBe("Olá \\#kbos \\(teste\\)");
    expect(post.content).toEqual({ media: { id: "urn:li:image:IMG1" } });
  });
  it("LinkedIn: recusa vídeo; sem x-restli-id dá erro", async () => {
    await expect(linkedinProvider.publish!("linkedin", acc, { format: "reels", caption: "x", media: [vid] }, noNet)).rejects.toBeInstanceOf(SocialError);
    const { f } = fakeNet({ "POST api.linkedin.com/rest/posts": () => new Response(null, { status: 201 }) });
    await expect(linkedinProvider.publish!("linkedin", acc, { format: "texto", caption: "só texto", media: [] }, f)).rejects.toThrow(/não devolveu o post/);
  });
  it("linkedinEscape: escapa os caracteres reservados do formato little text", () => {
    expect(linkedinEscape("a|b{c}d@e[f]g(h)i<j>k#l*m_n~o\\p")).toBe("a\\|b\\{c\\}d\\@e\\[f\\]g\\(h\\)i\\<j\\>k\\#l\\*m\\_n\\~o\\\\p");
    expect(linkedinEscape("texto normal, sem nada.")).toBe("texto normal, sem nada.");
  });
});

describe("erros da rede (readJson)", () => {
  it("HTTP 401 vira SocialError expirado", async () => {
    const e = await readJson(jres({ message: "token vencido" }, 401), "A rede").then(() => undefined as never, (x: SocialError) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.expired).toBe(true);
    expect(e.message).toBe("token vencido");
  });
  it("invalid_grant vira expirado, com a descrição", async () => {
    const e = await readJson(jres({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400), "O Google").then(() => undefined as never, (x: SocialError) => x);
    expect(e).toMatchObject({ expired: true, code: 400, message: "Token has been expired or revoked." });
  });
  it("código 190 e access_token_invalid expiram; outro erro não", async () => {
    expect((await readJson(jres({ error: { code: 190, message: "x" } }, 400), "A").then(() => undefined as never, (x: SocialError) => x)).expired).toBe(true);
    expect((await readJson(jres({ code: "access_token_invalid", message: "x" }, 400), "A").then(() => undefined as never, (x: SocialError) => x)).expired).toBe(true);
    expect((await readJson(jres({ error: { code: 100, message: "param" } }, 400), "A").then(() => undefined as never, (x: SocialError) => x)).expired).toBe(false);
  });
  it("sem corpo JSON usa a mensagem padrão; 200 ok devolve o JSON", async () => {
    const e = await readJson(new Response("<html>", { status: 502 }), "O Pinterest").then(() => undefined as never, (x: SocialError) => x);
    expect(e.message).toBe("O Pinterest respondeu 502.");
    expect(await readJson<{ a: number }>(jres({ a: 1 }), "X")).toEqual({ a: 1 });
  });
  it("provedor propaga o 401 como expirado (Pinterest e LinkedIn)", async () => {
    const { f } = fakeNet({ "POST api.pinterest.com/v5/oauth/token": () => jres({ message: "Authentication failed" }, 401) });
    await expect(pinterestProvider.refresh!("RT", f)).rejects.toMatchObject({ expired: true });
    const { f: f2 } = fakeNet({ "POST www.linkedin.com/oauth/v2/accessToken": () => jres({ error: "invalid_grant", error_description: "revogado" }, 400) });
    await expect(linkedinProvider.refresh!("RT", f2)).rejects.toMatchObject({ expired: true });
  });
  it("TikTok: invalid_grant (formato OAuth) expira; código comum não", async () => {
    const { f } = fakeNet({ "POST open.tiktokapis.com/v2/oauth/token/": () => jres({ error: "invalid_grant", error_description: "refresh token inválido" }, 400) });
    await expect(tiktokProvider.refresh!("RT", f)).rejects.toMatchObject({ expired: true, message: "refresh token inválido" });
    const { f: f2 } = fakeNet({ "POST open.tiktokapis.com/v2/oauth/token/": () => jres({ error: { code: "access_token_invalid", message: "vencido" } }, 401) });
    await expect(tiktokProvider.refresh!("RT", f2)).rejects.toMatchObject({ expired: true });
  });
});

describe("OAuth: state + cookie do fluxo", () => {
  const target: FlowTarget = { projectId: "proj-1", linkId: null, userId: "user-1", via: "admin", back: "/admin/" };

  it("startFlow/finishFlow: ida e volta devolve o destino e o verifier", () => {
    const s = startFlow("google", target, "S256");
    expect(s.challenge).toBeTruthy();
    expect(s.redirectUri).toBe(redirectUriFor("google"));
    expect(s.redirectUri).toBe("https://kbos.test/api/social/google/callback/");
    const flow = finishFlow("google", s.state, s.cookie)!;
    expect(flow).toMatchObject({ ...target, provider: "google" });
    expect(createHash("sha256").update(flow.verifier!).digest("base64url")).toBe(s.challenge);
  });
  it("sem PKCE: sem verifier nem challenge", () => {
    const s = startFlow("meta", target, false);
    expect(s.challenge).toBeUndefined();
    expect(finishFlow("meta", s.state, s.cookie)!.verifier).toBeNull();
  });
  it("TikTok: desafio em hexadecimal", () => {
    const s = startFlow("tiktok", target, "hex");
    const flow = finishFlow("tiktok", s.state, s.cookie)!;
    expect(s.challenge).toBe(createHash("sha256").update(flow.verifier!).digest("hex"));
  });
  it("o cookie não traz o verifier em texto claro", () => {
    const s = startFlow("google", target, "S256");
    const flow = JSON.parse(unseal(s.cookie));
    expect(flow.verifier).toBeTruthy();
    expect(s.cookie).not.toContain(flow.verifier);
    expect(s.cookie).not.toContain("proj-1");
    expect(s.cookie.startsWith("v2.")).toBe(true);
  });
  it("recusa assinatura do state adulterada", () => {
    const s = startFlow("google", target, "S256");
    const [nonce, sig] = s.state.split(".");
    const bad = `${nonce}.${sig.slice(0, -2)}${sig.endsWith("AA") ? "BB" : "AA"}`;
    expect(finishFlow("google", bad, s.cookie)).toBeNull();
    expect(finishFlow("google", `${nonce}.curta`, s.cookie)).toBeNull();
    expect(finishFlow("google", null, s.cookie)).toBeNull();
    expect(finishFlow("google", "", s.cookie)).toBeNull();
  });
  it("recusa outra rede (state e cookie de uma rede não valem em outra)", () => {
    const s = startFlow("google", target, "S256");
    expect(finishFlow("tiktok", s.state, s.cookie)).toBeNull();
  });
  it("recusa nonce diferente (state de um fluxo com o cookie de outro)", () => {
    const a = startFlow("google", target, "S256");
    const b = startFlow("google", target, "S256");
    expect(finishFlow("google", b.state, a.cookie)).toBeNull();
    expect(finishFlow("google", a.state, b.cookie)).toBeNull();
  });
  it("recusa fluxo vencido (10 min) e cookie ausente ou adulterado", () => {
    const now = Date.now();
    const s = startFlow("google", target, "S256", undefined, now);
    expect(finishFlow("google", s.state, s.cookie, now + 9 * 60_000)).not.toBeNull();
    expect(finishFlow("google", s.state, s.cookie, now + 11 * 60_000)).toBeNull();
    expect(finishFlow("google", s.state, undefined, now)).toBeNull();
    expect(finishFlow("google", s.state, s.cookie.slice(0, -3) + "xxx", now)).toBeNull();
  });
  it("pkcePair: verifier de 43 a 128 caracteres; S256 = base64url(sha256) e hex = sha256 em hexadecimal", () => {
    for (const kind of ["S256", "hex"] as const) {
      const { verifier, challenge } = pkcePair(kind);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      const h = createHash("sha256").update(verifier);
      expect(challenge).toBe(kind === "hex" ? h.digest("hex") : h.digest("base64url"));
    }
    expect(pkcePair("S256").verifier).not.toBe(pkcePair("S256").verifier);
  });
  it("safeBack: só caminhos internos", () => {
    expect(safeBack("//evil.com", "/x/")).toBe("/x/");
    expect(safeBack("https://evil.com", "/x/")).toBe("/x/");
    expect(safeBack("/\\evil.com", "/x/")).toBe("/x/");
    expect(safeBack(null, "/x/")).toBe("/x/");
    expect(safeBack(undefined, "/x/")).toBe("/x/");
    expect(safeBack("/portal/", "/x/")).toBe("/portal/");
    expect(safeBack("/admin/redes/?aba=1&ok=1", "/x/")).toBe("/admin/redes/?aba=1&ok=1");
  });
});

describe("social-crypto", () => {
  it("v2 quando há SOCIAL_TOKEN_KEY; não deixa o texto em claro", () => {
    const s = seal("token-secreto");
    expect(s.startsWith("v2.")).toBe(true);
    expect(s).not.toContain("token-secreto");
    expect(unseal(s)).toBe("token-secreto");
    expect(socialCryptoReady()).toBe(true);
  });
  it("token v1 (só segredo da Meta) continua abrindo depois que SOCIAL_TOKEN_KEY é adicionada", () => {
    vi.stubEnv("SOCIAL_TOKEN_KEY", "");
    const v1 = seal("token-antigo");
    expect(v1.startsWith("v1.")).toBe(true);
    vi.unstubAllEnvs();
    expect(process.env.SOCIAL_TOKEN_KEY).toBeTruthy();
    expect(unseal(v1)).toBe("token-antigo");
    expect(seal("novo").startsWith("v2.")).toBe(true);
  });
  it("adulteração (corpo, tag ou formato) lança erro", () => {
    const s = seal("abc");
    const [v, iv, tag, body] = s.split(".");
    expect(() => unseal(`${v}.${iv}.${tag}.${body.slice(0, -1)}${body.endsWith("A") ? "B" : "A"}`)).toThrow();
    expect(() => unseal(`${v}.${iv}.${tag.slice(0, -2)}${tag.endsWith("AA") ? "BB" : "AA"}.${body}`)).toThrow();
    expect(() => unseal("lixo")).toThrow(/formato/);
    expect(() => unseal(`v3.${iv}.${tag}.${body}`)).toThrow();
  });
  it("sem nenhuma chave não dá para ficar pronto", () => {
    vi.stubEnv("SOCIAL_TOKEN_KEY", "");
    vi.stubEnv("META_APP_SECRET", "");
    expect(socialCryptoReady()).toBe(false);
    expect(() => seal("x")).toThrow();
  });
});

describe("registro de provedores", () => {
  it("rede → provedor", () => {
    expect(providerForNetwork("instagram")!.id).toBe("meta");
    expect(providerForNetwork("facebook")!.id).toBe("meta");
    expect(providerForNetwork("youtube")!.id).toBe("youtube");
    expect(providerForNetwork("google")!.id).toBe("google");
    expect(providerForNetwork("tiktok")!.id).toBe("tiktok");
    expect(providerForNetwork("pinterest")!.id).toBe("pinterest");
    expect(providerForNetwork("linkedin")!.id).toBe("linkedin");
    expect(providerForNetwork("orkut")).toBeNull();
  });
  it("redes de publicação e ids únicos", () => {
    expect(PUBLISH_NETWORKS).toEqual(expect.arrayContaining(["instagram", "facebook", "youtube", "google", "tiktok", "pinterest", "linkedin"]));
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    expect(providerById("nada")).toBeNull();
  });
});
