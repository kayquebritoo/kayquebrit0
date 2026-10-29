import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
vi.hoisted(() => {
  Object.assign(process.env, {
    META_APP_ID: "12345", META_APP_SECRET: "segredo-meta-de-teste-123456",
    GOOGLE_SOCIAL_CLIENT_ID: "abc123.apps.googleusercontent.com", GOOGLE_SOCIAL_CLIENT_SECRET: "google-secret-123456",
    SOCIAL_TOKEN_KEY: "0123456789abcdef".repeat(4), APP_URL: "https://kbos.test",
  });
});
const dir = mkdtempSync(join(tmpdir(), "kbos-conn-"));
process.env.GALLERY_DIR = dir;

import { seal, unseal } from "../social-crypto";
import { SocialError, type ProviderAccount, type Tokens } from "../social/types";
import type { FlowTarget } from "../social/oauth";
import {
  accountState, accountsOverview, connectionToken, createConnectLink, disconnectAccount, ensurePersonalClient, linkAccounts,
  publishTokenFor, refreshDueConnections, resolveConnectLink, revokeConnectLink, saveConnection, type Actor,
} from "../social/connections";
import { startMedia } from "../social-media";
import { handleSocialTick, schedulePost, sendPublication } from "../social-publish";
import { syncPublications } from "../content-cycle";

const MP4 = Buffer.concat([Buffer.from("00000018", "hex"), Buffer.from("ftypmp42"), Buffer.alloc(3000, 2)]);

type Call = { method: string; host: string; path: string; body: URLSearchParams };
/** Rede de mentira: responde por "MÉTODO host/caminho"; rota não prevista derruba o teste. */
function fakeNet(routes: Record<string, (c: Call) => Response | object>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const call: Call = { method: init?.method ?? "GET", host: u.host, path: u.pathname, body: new URLSearchParams(init?.body instanceof URLSearchParams ? init.body.toString() : "") };
    calls.push(call);
    const r = routes[`${call.method} ${call.host}${call.path}`];
    if (!r) throw new Error(`sem rota ${call.method} ${call.host}${call.path}`);
    const out = r(call);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}
const noNet = (() => { throw new Error("não devia chamar a rede"); }) as unknown as typeof fetch;
const googleToken = (c: () => Response | object) => ({ "POST oauth2.googleapis.com/token": c });
const revokeOk = { "POST oauth2.googleapis.com/revoke": () => ({}) };

const pg = new PGlite(), d = drizzle(pg, { schema });
let userId: string, projA: string, projB: string;
const admin = (): Actor => ({ kind: "admin", userId, ip: "203.0.113.7", userAgent: "vitest" });
const target = (over: Partial<FlowTarget> = {}): FlowTarget => ({ projectId: projA, linkId: null, userId, via: "admin", back: "/admin/", ...over });
const yt = (id = "UC1", name = "Canal"): ProviderAccount => ({ network: "youtube", externalId: id, name, username: null, pictureUrl: null });
const tokens = (over: Partial<Tokens> = {}): Tokens => ({ accessToken: "AT-plain", refreshToken: "RT-plain", expiresAt: new Date(Date.now() + 3600_000), scopes: ["s1", "s2"], ...over });
const audit = async (action: string) => (await d.select().from(schema.socialAudit).where(eq(schema.socialAudit.action, action)));
const getConn = async (id: string) => (await d.select().from(schema.socialConnections).where(eq(schema.socialConnections.id, id)))[0];
const getAcc = async (id: string) => (await d.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, id)))[0];

/** Conexão do Google já gravada, com o vencimento escolhido. */
async function mkConn(over: Partial<typeof schema.socialConnections.$inferInsert> = {}, accounts = [yt()]) {
  const [c] = await d.insert(schema.socialConnections).values({ provider: "youtube", projectId: projA, tokenEnc: seal("AT-old"), refreshEnc: seal("RT-old"), expiresAt: new Date(Date.now() - 60_000), scopes: "s", ...over }).returning();
  const accs = [];
  for (const a of accounts) {
    const [row] = await d.insert(schema.socialAccounts).values({ network: a.network, externalId: a.externalId, name: a.name, provider: c.provider, connectionId: c.id, projectId: projA, status: "ativo" }).returning();
    accs.push(row);
  }
  return { conn: c, accs };
}

beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects, kbos_social_accounts, kbos_social_connections, kbos_social_connect_links, kbos_social_audit CASCADE");
  const [u] = await d.insert(schema.users).values({ email: "admin@kbos.test", name: "Admin", role: "admin" }).returning();
  const [a] = await d.insert(schema.projects).values({ titulo: "Hotel Atalaia VIP", categoria: "social" }).returning();
  const [b] = await d.insert(schema.projects).values({ titulo: "Lounge", categoria: "social" }).returning();
  userId = u.id; projA = a.id; projB = b.id;
});
afterAll(async () => { await pg.close(); rmSync(dir, { recursive: true, force: true }); });

describe("saveConnection", () => {
  it("guarda os tokens criptografados e liga as contas à conexão e ao provedor", async () => {
    const r = await saveConnection("youtube", tokens(), [yt()], target(), admin());
    const conn = await getConn(r.connectionId);
    expect(conn.tokenEnc).not.toContain("AT-plain");
    expect(conn.refreshEnc).not.toContain("RT-plain");
    expect(unseal(conn.tokenEnc)).toBe("AT-plain");
    expect(unseal(conn.refreshEnc!)).toBe("RT-plain");
    expect(conn).toMatchObject({ provider: "youtube", projectId: projA, via: "admin", status: "ativo", scopes: "s1 s2" });
    const [acc] = await d.select().from(schema.socialAccounts);
    expect(acc).toMatchObject({ connectionId: conn.id, provider: "youtube", projectId: projA, status: "ativo", tokenEnc: null });
  });
  it("conta com token próprio (Página da Meta) também é criptografada", async () => {
    await saveConnection("meta", { accessToken: "USER" }, [{ network: "facebook", externalId: "p1", pageId: "p1", name: "Pág", token: "PAGE-TOKEN" }], target(), admin());
    const [acc] = await d.select().from(schema.socialAccounts);
    expect(acc.tokenEnc).not.toContain("PAGE-TOKEN");
    expect(unseal(acc.tokenEnc!)).toBe("PAGE-TOKEN");
  });
  it("admin com projeto liga (e religa) a conta ao projeto escolhido", async () => {
    await saveConnection("youtube", tokens(), [yt()], target({ projectId: projA }), admin());
    await saveConnection("youtube", tokens(), [yt()], target({ projectId: projB }), admin());
    const rows = await d.select().from(schema.socialAccounts);
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe(projB);
  });
  it("por link/portal não rouba conta de outro projeto, mas liga quando está sem projeto", async () => {
    for (const via of ["link", "portal"] as const) {
      await pg.exec("TRUNCATE kbos_social_accounts, kbos_social_connections CASCADE");
      await saveConnection("youtube", tokens(), [yt("UC1")], target({ projectId: projA }), admin());
      const r = await saveConnection("youtube", tokens(), [yt("UC1"), yt("UC2")], target({ projectId: projB, via }), { kind: via === "link" ? "link" : "cliente", userId: null });
      const byId = Object.fromEntries((await d.select().from(schema.socialAccounts)).map((a) => [a.externalId, a.projectId]));
      expect(byId.UC1).toBe(projA); // continua do projeto original
      expect(byId.UC2).toBe(projB); // nova: entra no projeto do link
      expect(r.accounts.find((a) => a.name === "Canal" && a.projectId === projA)).toBeTruthy();
    }
    // conta existente sem projeto: o link assume
    await pg.exec("TRUNCATE kbos_social_accounts, kbos_social_connections CASCADE");
    await saveConnection("youtube", tokens(), [yt("UC3")], target({ projectId: null }), admin());
    await saveConnection("youtube", tokens(), [yt("UC3")], target({ projectId: projB, via: "link" }), { kind: "link", userId: null });
    expect((await d.select().from(schema.socialAccounts))[0].projectId).toBe(projB);
  });
  it("auditoria 'conectar' com ip, escopos, ator e detalhes", async () => {
    const r = await saveConnection("youtube", tokens(), [yt()], target(), admin());
    const [a] = await audit("conectar");
    expect(a).toMatchObject({ provider: "youtube", projectId: projA, connectionId: r.connectionId, actorId: userId, actorKind: "admin", ip: "203.0.113.7", scopes: "s1 s2" });
    expect((a.detail as { via: string; contas: string[] })).toMatchObject({ via: "admin", contas: ["youtube:Canal"] });
  });
  it("escopos padrão do provedor quando o login não informa", async () => {
    await saveConnection("pinterest", { accessToken: "A" }, [], target(), admin());
    const [a] = await audit("conectar");
    expect(a.scopes).toBe("user_accounts:read boards:read pins:read pins:write");
  });
  it("o uso do link é contado", async () => {
    const link = await createConnectLink(projA, admin());
    await saveConnection("youtube", tokens(), [yt()], target({ via: "link", linkId: link.id }), { kind: "link", userId: null, ip: "198.51.100.1" });
    await saveConnection("youtube", tokens(), [yt("UC9")], target({ via: "link", linkId: link.id }), { kind: "link", userId: null });
    const [row] = await d.select().from(schema.socialConnectLinks);
    expect(row.uses).toBe(2);
    expect(row.lastUsedAt).toBeInstanceOf(Date);
  });
  it("login novo substitui logins antigos da mesma rede que ficaram sem conta", async () => {
    const { conn: velha } = await mkConn({}, []);
    const r = await saveConnection("youtube", tokens(), [yt()], target(), admin());
    const ids = (await d.select().from(schema.socialConnections)).map((c) => c.id);
    expect(ids).toEqual([r.connectionId]);
    expect(ids).not.toContain(velha.id);
  });
  it("rede desconhecida é recusada", async () => {
    await expect(saveConnection("orkut", tokens(), [], target(), admin())).rejects.toBeInstanceOf(SocialError);
  });
});

describe("connectionToken / publishTokenFor", () => {
  it("token ainda válido volta como está, sem rede", async () => {
    const { conn } = await mkConn({ expiresAt: new Date(Date.now() + 3600_000) });
    expect(await connectionToken(conn, new Date(), noNet)).toBe("AT-old");
    const { conn: semFim } = await mkConn({ expiresAt: null, refreshEnc: null }, [yt("UC2")]);
    expect(await connectionToken(semFim, new Date(), noNet)).toBe("AT-old");
  });
  it("vencido com refresh: renova pelo provedor e grava o novo token criptografado", async () => {
    const { conn } = await mkConn();
    const { f, calls } = fakeNet(googleToken(() => ({ access_token: "AT-new", expires_in: 3600 })));
    expect(await connectionToken(conn, new Date(), f)).toBe("AT-new");
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get("grant_type")).toBe("refresh_token");
    expect(calls[0].body.get("refresh_token")).toBe("RT-old");
    const after = await getConn(conn.id);
    expect(after.tokenEnc).not.toContain("AT-new");
    expect(unseal(after.tokenEnc)).toBe("AT-new");
    expect(unseal(after.refreshEnc!)).toBe("RT-old"); // a rede não mandou outro: mantém
    expect(after.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 3000_000);
    expect(after.status).toBe("ativo");
  });
  it("refresh novo vindo da rede substitui o antigo", async () => {
    const { conn } = await mkConn({ provider: "tiktok" }, [{ network: "tiktok", externalId: "T1", name: "T", username: null, pictureUrl: null }]);
    const tk = { "POST open.tiktokapis.com/v2/oauth/token/": () => ({ access_token: "AT-new", refresh_token: "RT-new", expires_in: 86400 }) };
    process.env.TIKTOK_CLIENT_KEY = "tiktokkey123"; process.env.TIKTOK_CLIENT_SECRET = "tiktok-secret-1234567890";
    await connectionToken(conn, new Date(), fakeNet(tk).f);
    expect(unseal((await getConn(conn.id)).refreshEnc!)).toBe("RT-new");
  });
  it("vence em menos de 5 min: já renova antes", async () => {
    const { conn } = await mkConn({ expiresAt: new Date(Date.now() + 4 * 60_000) });
    const { f, calls } = fakeNet(googleToken(() => ({ access_token: "AT-new", expires_in: 3600 })));
    expect(await connectionToken(conn, new Date(), f)).toBe("AT-new");
    expect(calls).toHaveLength(1);
  });
  it("invalid_grant: conexão e contas viram 'expirado' e a auditoria registra 'renovar-falhou'", async () => {
    const { conn, accs } = await mkConn({}, [yt("UC1"), yt("UC2")]);
    const { f } = fakeNet(googleToken(() => new Response(JSON.stringify({ error: "invalid_grant", error_description: "revogado" }), { status: 400 })));
    const e = await connectionToken(conn, new Date(), f).then(() => undefined as never, (x: SocialError) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.expired).toBe(true);
    const after = await getConn(conn.id);
    expect(after.status).toBe("expirado");
    expect(after.lastError).toBe("revogado");
    for (const a of accs) expect((await getAcc(a.id)).status).toBe("expirado");
    const [log] = await audit("renovar-falhou");
    expect(log).toMatchObject({ provider: "youtube", connectionId: conn.id, actorKind: "sistema" });
  });
  it("erro de rede ao renovar não marca expirado", async () => {
    const { conn } = await mkConn();
    const { f } = fakeNet(googleToken(() => new Response("{}", { status: 503 })));
    await expect(connectionToken(conn, new Date(), f)).rejects.toBeInstanceOf(SocialError);
    expect((await getConn(conn.id)).status).toBe("ativo");
    expect(await audit("renovar-falhou")).toHaveLength(0);
  });
  it("vencido sem refresh: marca expirado e pede reconexão", async () => {
    const { conn, accs } = await mkConn({ refreshEnc: null });
    const e = await connectionToken(conn, new Date(), noNet).then(() => undefined as never, (x: SocialError) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.expired).toBe(true);
    expect((await getConn(conn.id)).status).toBe("expirado");
    expect((await getAcc(accs[0].id)).status).toBe("expirado");
  });
  it("publishTokenFor: token da própria conta, o da conexão, ou erro sem conexão", async () => {
    const { accs } = await mkConn({ expiresAt: new Date(Date.now() + 3600_000) });
    expect(await publishTokenFor(accs[0], new Date(), noNet)).toBe("AT-old");
    expect(await publishTokenFor({ ...accs[0], tokenEnc: seal("PAGE") }, new Date(), noNet)).toBe("PAGE");
    const e = await publishTokenFor({ ...accs[0], connectionId: null }, new Date(), noNet).then(() => undefined as never, (x: SocialError) => x);
    expect(e).toMatchObject({ expired: true, code: "no-connection" });
  });
});

describe("refreshDueConnections", () => {
  it("renova só quem vence em até 30 min", async () => {
    const now = new Date();
    const { conn: due } = await mkConn({ expiresAt: new Date(now.getTime() + 10 * 60_000) }, [yt("UC1")]);
    const { conn: later } = await mkConn({ expiresAt: new Date(now.getTime() + 2 * 3600_000) }, [yt("UC2")]);
    const { conn: noRefresh } = await mkConn({ expiresAt: new Date(now.getTime() + 10 * 60_000), refreshEnc: null }, [yt("UC3")]);
    const { conn: dead } = await mkConn({ expiresAt: new Date(now.getTime() + 10 * 60_000), status: "expirado" }, [yt("UC4")]);
    const { f, calls } = fakeNet(googleToken(() => ({ access_token: "AT-new", expires_in: 3600 })));
    expect(await refreshDueConnections(now, f)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(unseal((await getConn(due.id)).tokenEnc)).toBe("AT-new");
    for (const c of [later, noRefresh, dead]) expect(unseal((await getConn(c.id)).tokenEnc)).toBe("AT-old");
  });
  it("falha de uma conexão não impede as outras", async () => {
    const now = new Date();
    await mkConn({ expiresAt: new Date(now.getTime() + 60_000) }, [yt("UC1")]);
    await mkConn({ expiresAt: new Date(now.getTime() + 60_000) }, [yt("UC2")]);
    let n = 0;
    const { f } = fakeNet(googleToken(() => (++n === 1 ? new Response("{}", { status: 500 }) : { access_token: "AT-new", expires_in: 3600 })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await refreshDueConnections(now, f)).toBe(1);
    spy.mockRestore();
  });
  // regressão: a consulta pega quem vence em 30 min; a renovação precisa ser forçada (antes só renovava a 15 min)
  it("renova também quem vence entre 15 e 30 min (janela anunciada de 30 min)", async () => {
    const now = new Date();
    const { conn } = await mkConn({ expiresAt: new Date(now.getTime() + 25 * 60_000) });
    const { f, calls } = fakeNet(googleToken(() => ({ access_token: "AT-new", expires_in: 3600 })));
    await refreshDueConnections(now, f);
    expect(calls).toHaveLength(1);
    expect(unseal((await getConn(conn.id)).tokenEnc)).toBe("AT-new");
  });
});

describe("disconnectAccount", () => {
  async function pubOn(accountId: string) {
    const [post] = await d.insert(schema.socialPosts).values({ projectId: projA, title: "P", format: "reels", status: "agendado" }).returning();
    const [pub] = await d.insert(schema.postPublications).values({ postId: post.id, network: "youtube", status: "agendado", accountId }).returning();
    return pub;
  }
  it("última conta do login: revoga na rede, apaga a conexão, solta as publicações e audita", async () => {
    const { conn, accs } = await mkConn({ expiresAt: new Date(Date.now() + 3600_000) });
    const pub = await pubOn(accs[0].id);
    const { f, calls } = fakeNet(revokeOk);
    const r = await disconnectAccount(accs[0].id, admin(), f);
    expect(r).toEqual({ ok: true, revoked: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.get("token")).toBe("AT-old");
    expect(await getConn(conn.id)).toBeUndefined();
    expect(await getAcc(accs[0].id)).toBeUndefined();
    expect((await d.select().from(schema.postPublications).where(eq(schema.postPublications.id, pub.id)))[0].accountId).toBeNull();
    const [log] = await audit("desconectar");
    expect(log).toMatchObject({ provider: "youtube", projectId: projA, connectionId: conn.id, actorKind: "admin", ip: "203.0.113.7" });
    expect(log.detail).toMatchObject({ conta: "youtube:Canal", revogado: true });
  });
  it("com contas irmãs no mesmo login: não revoga, só tira a conta", async () => {
    const { conn, accs } = await mkConn({}, [yt("UC1", "A"), yt("UC2", "B")]);
    const r = await disconnectAccount(accs[0].id, admin(), noNet);
    expect(r).toEqual({ ok: true, revoked: false });
    expect(await getAcc(accs[0].id)).toBeUndefined();
    expect(await getAcc(accs[1].id)).toBeDefined();
    expect(await getConn(conn.id)).toBeDefined();
  });
  it("Pinterest não revoga por API: revoked 'manual' e o token some daqui", async () => {
    const { conn, accs } = await mkConn({ provider: "pinterest" }, [{ network: "pinterest", externalId: "b1", name: "Pasta", username: null, pictureUrl: null }]);
    const r = await disconnectAccount(accs[0].id, admin(), noNet);
    expect(r).toEqual({ ok: true, revoked: "manual" });
    expect(await getConn(conn.id)).toBeUndefined();
    expect((await audit("desconectar"))[0].detail).toMatchObject({ revogado: "manual" });
  });
  it("erro de rede ao revogar não impede de apagar", async () => {
    const { conn, accs } = await mkConn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { f } = fakeNet({ "POST oauth2.googleapis.com/revoke": () => new Response("{}", { status: 500 }) });
    expect(await disconnectAccount(accs[0].id, admin(), f)).toEqual({ ok: true, revoked: false });
    spy.mockRestore();
    expect(await getConn(conn.id)).toBeUndefined();
  });
  it("conta inexistente", async () => {
    expect(await disconnectAccount("00000000-0000-0000-0000-000000000000", admin(), noNet)).toMatchObject({ ok: false });
  });
});

describe("link de conexão", () => {
  it("cria URL com token de 32 caracteres e guarda só o hash sha256", async () => {
    const link = await createConnectLink(projA, admin());
    const m = link.url.match(/^https:\/\/kbos\.test\/conectar\/([A-Za-z0-9_-]{32})\/$/);
    expect(m).not.toBeNull();
    const token = m![1];
    const [row] = await d.select().from(schema.socialConnectLinks);
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(link.project).toBe("Hotel Atalaia VIP");
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect((await audit("link-criado"))[0]).toMatchObject({ projectId: projA, actorKind: "admin" });
  });
  it("projeto inexistente é recusado", async () => {
    await expect(createConnectLink("00000000-0000-0000-0000-000000000000", admin())).rejects.toBeInstanceOf(SocialError);
  });
  it("resolve enquanto vale; falha após 7 dias, depois de cancelado e com token malformado", async () => {
    const tok = (u: string) => u.match(/conectar\/([^/]+)\//)![1];
    const link = await createConnectLink(projA, admin());
    const token = tok(link.url);
    expect(await resolveConnectLink(token)).toMatchObject({ id: link.id, projectId: projA, project: "Hotel Atalaia VIP" });
    expect(await resolveConnectLink(token, new Date(Date.now() + 8 * 86_400_000))).toBeNull();
    expect(await resolveConnectLink("curto")).toBeNull();
    expect(await resolveConnectLink(`${token}x`)).toBeNull();
    expect(await resolveConnectLink("../".repeat(11))).toBeNull();
    expect(await resolveConnectLink("A".repeat(32))).toBeNull(); // formato certo, mas não existe
    expect(await revokeConnectLink(link.id, admin())).toBe(true);
    expect(await resolveConnectLink(token)).toBeNull();
    expect(await revokeConnectLink(link.id, admin())).toBe(false); // já cancelado
    expect(await audit("link-cancelado")).toHaveLength(1);
  });
  it("linkAccounts devolve só as contas criadas por aquele link", async () => {
    const l1 = await createConnectLink(projA, admin());
    const l2 = await createConnectLink(projA, admin());
    await saveConnection("youtube", tokens(), [yt("UC1", "Do link 1")], target({ via: "link", linkId: l1.id }), { kind: "link", userId: null });
    await saveConnection("tiktok", tokens(), [{ network: "tiktok", externalId: "T1", name: "Do link 2", username: null, pictureUrl: null }], target({ via: "link", linkId: l2.id }), { kind: "link", userId: null });
    await saveConnection("pinterest", tokens(), [{ network: "pinterest", externalId: "b1", name: "Do admin", username: null, pictureUrl: null }], target(), admin());
    expect((await linkAccounts(l1.id)).map((a) => a.name)).toEqual(["Do link 1"]);
    expect((await linkAccounts(l2.id)).map((a) => a.name)).toEqual(["Do link 2"]);
    expect(await linkAccounts("00000000-0000-0000-0000-000000000000")).toEqual([]);
  });
});

describe("cliente pessoal", () => {
  it("é idempotente", async () => {
    const a = await ensurePersonalClient(userId);
    const b = await ensurePersonalClient(userId);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    expect(await audit("cliente-pessoal")).toHaveLength(1);
    expect((await d.select().from(schema.projects).where(eq(schema.projects.titulo, "Kayque Brito (pessoal)")))).toHaveLength(1);
  });
});

describe("accountState", () => {
  const now = Date.now();
  const past = new Date(now - 60_000), future = new Date(now + 3600_000);
  it("não-Meta sem refresh e vencido = expirado; com refresh continua ativo", () => {
    expect(accountState({ status: "ativo", provider: "youtube", expiresAt: past, refreshExpiresAt: null, hasRefresh: false }, now)).toBe("expirado");
    expect(accountState({ status: "ativo", provider: "youtube", expiresAt: past, refreshExpiresAt: null, hasRefresh: true }, now)).toBe("ativo");
    expect(accountState({ status: "ativo", provider: "youtube", expiresAt: future, refreshExpiresAt: null, hasRefresh: false }, now)).toBe("ativo");
  });
  it("refresh vencido = expirado", () => {
    expect(accountState({ status: "ativo", provider: "tiktok", expiresAt: future, refreshExpiresAt: past, hasRefresh: true }, now)).toBe("expirado");
  });
  it("Meta ignora o vencimento da conexão", () => {
    expect(accountState({ status: "ativo", provider: "meta", expiresAt: past, refreshExpiresAt: past, hasRefresh: false }, now)).toBe("ativo");
  });
  it("status diferente de ativo = expirado; conta sem provedor segue o status", () => {
    expect(accountState({ status: "erro", provider: "meta", expiresAt: null, refreshExpiresAt: null, hasRefresh: null }, now)).toBe("expirado");
    expect(accountState({ status: "ativo", provider: null, expiresAt: past, refreshExpiresAt: null, hasRefresh: null }, now)).toBe("ativo");
  });
  it("accountsOverview aplica o estado e filtra por projeto", async () => {
    await mkConn({ refreshEnc: null, expiresAt: past }, [yt("UC1", "Vencida")]);
    await saveConnection("meta", { accessToken: "U", expiresAt: past }, [{ network: "facebook", externalId: "p1", pageId: "p1", name: "Pág", token: "PT" }], target({ projectId: projB }), admin());
    const all = await accountsOverview();
    expect(Object.fromEntries(all.map((a) => [a.name, a.status]))).toEqual({ Vencida: "expirado", "Pág": "ativo" });
    expect((await accountsOverview([projB])).map((a) => a.name)).toEqual(["Pág"]);
    expect(await accountsOverview([])).toEqual([]);
  });
});

describe("publicar com o token da conexão (YouTube)", () => {
  async function setup(connOver: Partial<typeof schema.socialConnections.$inferInsert> = {}) {
    const [post] = await d.insert(schema.socialPosts).values({ projectId: projA, title: "Piscina", format: "reels", status: "aprovado", caption: "Bom dia", scheduledAt: new Date("2026-11-02T18:00:00-03:00") }).returning();
    expect((await startMedia(post.id, "piscina.mp4", MP4.length, MP4)).done).toBe(true);
    await syncPublications(post.id, ["youtube"]);
    const { conn, accs } = await mkConn({ expiresAt: new Date("2027-01-01T00:00:00Z"), ...connOver });
    await d.update(schema.socialConnections).set({ tokenEnc: seal("AT-do-youtube") }).where(eq(schema.socialConnections.id, conn.id));
    return { post, conn, acc: accs[0] };
  }
  it("a conta não tem token próprio: o publisher recebe o access token da conexão", async () => {
    const { post, acc } = await setup();
    expect(acc.tokenEnc).toBeNull();
    expect(await schedulePost(post.id, { at: new Date("2026-11-02T18:00:00-03:00") })).toBe(1);
    const seen: { token: string; externalId: string; network: string }[] = [];
    const publisher = async (network: string, a: { token: string; externalId: string }) => {
      seen.push({ network, token: a.token, externalId: a.externalId });
      return { externalId: "VID1", url: "https://youtu.be/VID1" };
    };
    const out = await handleSocialTick(new Date("2026-11-02T18:00:30-03:00"), publisher);
    expect(out).toMatchObject([{ result: "publicado", externalId: "VID1", url: "https://youtu.be/VID1" }]);
    expect(seen).toEqual([{ network: "youtube", token: "AT-do-youtube", externalId: "UC1" }]);
    const [pub] = await d.select().from(schema.postPublications);
    expect(pub).toMatchObject({ status: "publicado", externalId: "VID1" });
    expect((await audit("agendar"))[0]).toMatchObject({ projectId: projA, actorKind: "admin" });
    expect((await audit("publicar"))[0]).toMatchObject({ provider: "youtube", projectId: projA, actorKind: "sistema", detail: expect.objectContaining({ externalId: "VID1", url: "https://youtu.be/VID1" }) });
  });
  it("conexão vencida sem refresh: não publica, marca conta e conexão como expiradas e audita falha", async () => {
    const { post, conn, acc } = await setup({ expiresAt: new Date("2026-11-02T00:00:00Z"), refreshEnc: null });
    await schedulePost(post.id, { at: new Date("2026-11-02T18:00:00-03:00") });
    const [pub] = await d.select().from(schema.postPublications);
    let chamou = false;
    const r = await sendPublication(pub.id, new Date("2026-11-02T18:00:30-03:00"), async () => { chamou = true; return { externalId: "x", url: null }; });
    expect(chamou).toBe(false);
    expect(r.result).toBe("erro");
    expect((await getAcc(acc.id)).status).toBe("expirado");
    expect((await getConn(conn.id)).status).toBe("expirado");
    expect((await audit("publicar-falhou"))[0]).toMatchObject({ projectId: projA, actorKind: "sistema" });
    // conta já expirada: não permite novo agendamento até reconectar
    await d.update(schema.postPublications).set({ status: "pendente" }).where(eq(schema.postPublications.id, pub.id));
    await expect(schedulePost(post.id, { at: new Date("2026-11-03T18:00:00-03:00") })).rejects.toThrow(/reconectar/);
  });
  it("isolamento e permissão no portal: titular por empresa gerencia redes da sua empresa e não acessa outra", async () => {
    const { socialManageableProjectIds } = await import("../social/routes");
    const { assignAccountProject } = await import("../social/connections");
    const [cliA, cliB] = await d.insert(schema.users).values([
      { email: "titular@empresa-a.com", name: "Titular A", role: "cliente" },
      { email: "outro@empresa-b.com", name: "Outro B", role: "cliente" },
    ]).returning();
    const [compA] = await d.insert(schema.companies).values({ name: "Empresa A", slug: "empresa-a" }).returning();
    await d.update(schema.projects).set({ companyId: compA.id, recurring: true }).where(eq(schema.projects.id, projA));
    await d.update(schema.projects).set({ clienteId: cliB.id, recurring: true }).where(eq(schema.projects.id, projB));
    await d.insert(schema.companyAccess).values({ companyId: compA.id, userId: cliA.id, role: "titular" });

    const allowedA = await socialManageableProjectIds(cliA.id);
    const allowedB = await socialManageableProjectIds(cliB.id);
    expect(allowedA).toEqual([projA]);
    expect(allowedB).toEqual([projB]);

    const { accs } = await mkConn({ expiresAt: new Date(Date.now() + 3600_000) });
    // cliB não vê nem move a conta de projA
    expect(await accountsOverview(allowedB)).toHaveLength(0);
    expect(await assignAccountProject(accs[0].id, projB, { kind: "cliente", userId: cliB.id }, allowedB)).toBe(false);
    // cliA vê a conta de projA com escopos e status
    const seenA = await accountsOverview(allowedA);
    expect(seenA).toHaveLength(1);
    expect(seenA[0]).toMatchObject({ id: accs[0].id, projectId: projA, status: "ativo", scopes: "s" });
  });
});
