// Conexões das redes por cliente: guarda o login (tokens criptografados), liga as contas ao projeto/operação,
// renova o token sozinho, desconecta revogando na rede e registra tudo na auditoria (quem, quando, escopos, IP).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { appUrlEnv } from "../email";
import { postPublications, projects, socialAccounts, socialAudit, socialConnectLinks, socialConnections, users } from "../schema";
import { seal, socialCryptoReady, unseal } from "../social-crypto";
import { PROVIDERS, providerById } from "./providers";
import { SocialError, type Fetch, type ProviderAccount, type Tokens } from "./types";
import type { FlowTarget } from "./oauth";

export type Actor = { kind: "admin" | "cliente" | "link" | "sistema"; userId: string | null; ip?: string | null; userAgent?: string | null };
const SYSTEM: Actor = { kind: "sistema", userId: null };

/** Redes para os botões: sem chave no servidor = "Em breve" (desligado, sem erro). */
export const providerStatus = () =>
  PROVIDERS.map((p) => ({ id: p.id, label: p.label, networks: p.networks, scopes: p.scopes, canPublish: p.canPublish, configured: socialCryptoReady() && p.configured() }));
/** O mesmo, sem a lista de escopos (para o portal e o link público). */
export const publicProviderStatus = () => providerStatus().map((p) => ({ id: p.id, label: p.label, networks: p.networks, canPublish: p.canPublish, configured: p.configured }));

// ── auditoria ──────────────────────────────────────────────────────────────────
export async function logAudit(action: string, actor: Actor, e: { provider?: string | null; projectId?: string | null; connectionId?: string | null; scopes?: string[] | string | null; detail?: Record<string, unknown> } = {}) {
  await db().insert(socialAudit).values({
    action, provider: e.provider ?? null, projectId: e.projectId ?? null, connectionId: e.connectionId ?? null,
    actorId: actor.userId, actorKind: actor.kind, ip: actor.ip?.slice(0, 64) ?? null, userAgent: actor.userAgent?.slice(0, 200) ?? null,
    scopes: Array.isArray(e.scopes) ? e.scopes.join(" ") : e.scopes ?? null, detail: e.detail ?? null,
  });
}

export async function listAudit(opts: { projectId?: string; limit?: number } = {}) {
  return db().select({ id: socialAudit.id, action: socialAudit.action, provider: socialAudit.provider, projectId: socialAudit.projectId, project: projects.titulo, actorKind: socialAudit.actorKind, actor: users.name, ip: socialAudit.ip, scopes: socialAudit.scopes, detail: socialAudit.detail, createdAt: socialAudit.createdAt })
    .from(socialAudit).leftJoin(projects, eq(projects.id, socialAudit.projectId)).leftJoin(users, eq(users.id, socialAudit.actorId))
    .where(opts.projectId ? eq(socialAudit.projectId, opts.projectId) : undefined)
    .orderBy(desc(socialAudit.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
}

// ── conectar ───────────────────────────────────────────────────────────────────
/**
 * Guarda o login e as contas que vieram dele. Projeto da conta: o admin escolhe e vale sempre;
 * pelo portal/link a conta só entra no projeto se ainda não for de outro (nunca rouba conta já ligada).
 */
export async function saveConnection(providerId: string, tokens: Tokens, accounts: ProviderAccount[], target: FlowTarget, actor: Actor) {
  const provider = providerById(providerId);
  if (!provider) throw new SocialError("Rede desconhecida.");
  const d = db();
  const [conn] = await d.insert(socialConnections).values({
    provider: provider.id, projectId: target.projectId, externalUserId: tokens.externalUserId ?? null, name: tokens.userName ?? accounts[0]?.name ?? null,
    tokenEnc: seal(tokens.accessToken), refreshEnc: tokens.refreshToken ? seal(tokens.refreshToken) : null, expiresAt: tokens.expiresAt ?? null, refreshExpiresAt: tokens.refreshExpiresAt ?? null,
    scopes: (tokens.scopes ?? provider.scopes).join(" "), via: target.via, linkId: target.linkId, connectedBy: target.userId,
  }).returning();
  const saved: { id: string; name: string; network: string; projectId: string | null }[] = [];
  for (const a of accounts) {
    const [prev] = await d.select({ projectId: socialAccounts.projectId }).from(socialAccounts).where(and(eq(socialAccounts.network, a.network), eq(socialAccounts.externalId, a.externalId))).limit(1);
    const projectId = target.projectId && (target.via === "admin" || !prev?.projectId) ? target.projectId : prev?.projectId ?? null;
    const values = { network: a.network, externalId: a.externalId, pageId: a.pageId ?? null, name: a.name, username: a.username ?? null, pictureUrl: a.pictureUrl ?? null, tokenEnc: a.token ? seal(a.token) : null, status: "ativo", lastError: null, connectedBy: target.userId, provider: provider.id, connectionId: conn.id, projectId, updatedAt: new Date() };
    const [row] = await d.insert(socialAccounts).values(values).onConflictDoUpdate({ target: [socialAccounts.network, socialAccounts.externalId], set: values }).returning({ id: socialAccounts.id });
    saved.push({ id: row.id, name: a.name, network: a.network, projectId });
  }
  // logins antigos da mesma rede que ficaram sem conta: o novo substituiu (não revoga: na Meta/Google é a mesma autorização)
  await d.delete(socialConnections).where(and(eq(socialConnections.provider, provider.id), sql`${socialConnections.id} <> ${conn.id}`, sql`NOT EXISTS (SELECT 1 FROM ${socialAccounts} WHERE ${socialAccounts.connectionId} = ${socialConnections.id})`));
  if (target.linkId) await d.update(socialConnectLinks).set({ uses: sql`${socialConnectLinks.uses} + 1`, lastUsedAt: new Date() }).where(eq(socialConnectLinks.id, target.linkId));
  await logAudit("conectar", actor, { provider: provider.id, projectId: target.projectId, connectionId: conn.id, scopes: tokens.scopes ?? provider.scopes, detail: { via: target.via, contas: saved.map((s) => `${s.network}:${s.name}`) } });
  return { connectionId: conn.id, accounts: saved };
}

// ── token na hora de usar ──────────────────────────────────────────────────────
type ConnRow = typeof socialConnections.$inferSelect;
const SKEW_MS = 5 * 60_000;

async function markExpired(connId: string, message: string) {
  await db().update(socialConnections).set({ status: "expirado", lastError: message.slice(0, 500), updatedAt: new Date() }).where(eq(socialConnections.id, connId));
  await db().update(socialAccounts).set({ status: "expirado", lastError: message.slice(0, 500), updatedAt: new Date() }).where(eq(socialAccounts.connectionId, connId));
}

/** Token de acesso válido da conexão; renova antes de vencer quando a rede tem refresh. */
export async function connectionToken(conn: ConnRow, now = new Date(), f?: Fetch) {
  const provider = providerById(conn.provider);
  if (!provider) throw new SocialError("Rede desconhecida.");
  const fresh = !conn.expiresAt || conn.expiresAt.getTime() - SKEW_MS > now.getTime();
  if (fresh) return unseal(conn.tokenEnc);
  if (!conn.refreshEnc || !provider.refresh) {
    await markExpired(conn.id, "O acesso venceu. Reconecte a rede.");
    throw new SocialError("A conexão com a rede venceu. Reconecte.", "expired", true);
  }
  try {
    const t = await provider.refresh(unseal(conn.refreshEnc), f);
    await db().update(socialConnections).set({
      tokenEnc: seal(t.accessToken), refreshEnc: t.refreshToken ? seal(t.refreshToken) : conn.refreshEnc, expiresAt: t.expiresAt ?? null,
      refreshExpiresAt: t.refreshExpiresAt ?? conn.refreshExpiresAt, status: "ativo", lastError: null, updatedAt: new Date(),
    }).where(eq(socialConnections.id, conn.id));
    return t.accessToken;
  } catch (e) {
    if (e instanceof SocialError && e.expired) {
      await markExpired(conn.id, e.message);
      await logAudit("renovar-falhou", SYSTEM, { provider: conn.provider, projectId: conn.projectId, connectionId: conn.id, detail: { motivo: e.message.slice(0, 200) } });
    }
    throw e;
  }
}

/** Token para publicar numa conta: o da própria conta (Página da Meta) ou o da conexão (renovado se preciso). */
export async function publishTokenFor(acc: typeof socialAccounts.$inferSelect, now = new Date(), f?: Fetch) {
  if (acc.tokenEnc) return unseal(acc.tokenEnc);
  const [conn] = acc.connectionId ? await db().select().from(socialConnections).where(eq(socialConnections.id, acc.connectionId)).limit(1) : [];
  if (!conn) throw new SocialError("A conta perdeu o login. Reconecte a rede.", "no-connection", true);
  return connectionToken(conn, now, f);
}

/** Renovação automática (roda junto do verificador): renova o que vence nos próximos 30 min. */
export async function refreshDueConnections(now = new Date(), f?: Fetch) {
  const due = await db().select().from(socialConnections)
    .where(and(eq(socialConnections.status, "ativo"), isNotNull(socialConnections.refreshEnc), lt(socialConnections.expiresAt, new Date(now.getTime() + 30 * 60_000)))).limit(10);
  let ok = 0;
  for (const c of due) {
    try { await connectionToken(c, new Date(now.getTime() + SKEW_MS * 2), f); ok++; } catch (e) { console.error("[social] renovar", c.provider, e instanceof Error ? e.message : e); }
  }
  return ok;
}

// ── desconectar ────────────────────────────────────────────────────────────────
/**
 * Desconecta uma conta. Se era a última conta daquele login, revoga o token na rede e apaga o login.
 * Se o mesmo login traz outras contas (ex.: várias Páginas), só esta sai do KBOS (revogar derrubaria as outras).
 */
export async function disconnectAccount(accountId: string, actor: Actor, f?: Fetch) {
  const d = db();
  const [acc] = await d.select().from(socialAccounts).where(eq(socialAccounts.id, accountId)).limit(1);
  if (!acc) return { ok: false as const, error: "Conta não encontrada." };
  const [conn] = acc.connectionId ? await d.select().from(socialConnections).where(eq(socialConnections.id, acc.connectionId)).limit(1) : [];
  const siblings = conn ? (await d.select({ id: socialAccounts.id }).from(socialAccounts).where(eq(socialAccounts.connectionId, conn.id))).length : 0;
  let revoked: boolean | "manual" = false;
  if (conn && siblings <= 1) revoked = await revokeConnection(conn, f);
  await d.update(postPublications).set({ accountId: null }).where(eq(postPublications.accountId, acc.id));
  await d.delete(socialAccounts).where(eq(socialAccounts.id, acc.id));
  if (conn && siblings <= 1) await d.delete(socialConnections).where(eq(socialConnections.id, conn.id));
  await logAudit("desconectar", actor, { provider: acc.provider ?? acc.network, projectId: acc.projectId, connectionId: conn?.id ?? null, detail: { conta: `${acc.network}:${acc.name}`, revogado: revoked } });
  return { ok: true as const, revoked };
}

/** Revoga na rede; erro de rede não impede apagar daqui (o token some do KBOS de qualquer jeito). */
async function revokeConnection(conn: ConnRow, f?: Fetch): Promise<boolean | "manual"> {
  const provider = providerById(conn.provider);
  if (!provider) return false;
  try {
    return (await provider.revoke(unseal(conn.tokenEnc), f)) ? true : "manual";
  } catch (e) {
    console.error("[social] revogar", conn.provider, e instanceof Error ? e.message : e);
    return false;
  }
}

// ── contas por cliente ─────────────────────────────────────────────────────────
export async function accountsOverview(projectIds?: string[]) {
  if (projectIds && !projectIds.length) return [];
  const rows = await db().select({
    id: socialAccounts.id, projectId: socialAccounts.projectId, project: projects.titulo, network: socialAccounts.network, provider: socialAccounts.provider,
    name: socialAccounts.name, username: socialAccounts.username, pictureUrl: socialAccounts.pictureUrl, status: socialAccounts.status, lastError: socialAccounts.lastError,
    connectedAt: socialAccounts.updatedAt, via: socialConnections.via, scopes: socialConnections.scopes, expiresAt: socialConnections.expiresAt, refreshExpiresAt: socialConnections.refreshExpiresAt, hasRefresh: sql<boolean>`${socialConnections.refreshEnc} IS NOT NULL`, connectedBy: users.name,
  }).from(socialAccounts)
    .leftJoin(socialConnections, eq(socialConnections.id, socialAccounts.connectionId))
    .leftJoin(projects, eq(projects.id, socialAccounts.projectId))
    .leftJoin(users, eq(users.id, socialAccounts.connectedBy))
    .where(projectIds ? inArray(socialAccounts.projectId, projectIds) : undefined)
    .orderBy(socialAccounts.network, socialAccounts.name);
  const now = Date.now();
  return rows.map((r) => ({ ...r, status: accountState(r, now) }));
}

/** ativo | expirado (reconectar). Sem refresh e com o acesso vencido também conta como expirado. */
export function accountState(r: { status: string; provider: string | null; expiresAt: Date | null; refreshExpiresAt: Date | null; hasRefresh: boolean | null }, now = Date.now()) {
  if (r.status !== "ativo") return "expirado";
  if (r.provider && r.provider !== "meta") {
    if (r.refreshExpiresAt && r.refreshExpiresAt.getTime() < now) return "expirado";
    if (!r.hasRefresh && r.expiresAt && r.expiresAt.getTime() < now) return "expirado";
  }
  return "ativo";
}

export async function assignAccountProject(id: string, projectId: string | null, actor: Actor, allowed?: string[]) {
  if (allowed && projectId && !allowed.includes(projectId)) return false;
  const where = allowed ? and(eq(socialAccounts.id, id), inArray(socialAccounts.projectId, allowed)) : eq(socialAccounts.id, id);
  const [row] = await db().update(socialAccounts).set({ projectId, updatedAt: new Date() }).where(where).returning({ id: socialAccounts.id, network: socialAccounts.network, name: socialAccounts.name });
  if (row) await logAudit("ligar-projeto", actor, { projectId, detail: { conta: `${row.network}:${row.name}` } });
  return !!row;
}

// ── link de conexão (WhatsApp) ─────────────────────────────────────────────────
export const LINK_DAYS = 7;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createConnectLink(projectId: string, actor: Actor) {
  const [p] = await db().select({ id: projects.id, titulo: projects.titulo }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) throw new SocialError("Projeto não encontrado.");
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
  const [row] = await db().insert(socialConnectLinks).values({ tokenHash: hash(token), projectId, createdBy: actor.userId, expiresAt }).returning({ id: socialConnectLinks.id });
  await logAudit("link-criado", actor, { projectId, detail: { linkId: row.id, expira: expiresAt.toISOString() } });
  return { id: row.id, url: `${appUrlEnv()}/conectar/${token}/`, expiresAt, project: p.titulo };
}

/** Link válido (não revogado, dentro dos 7 dias) → projeto. Só o hash do token fica no banco. */
export async function resolveConnectLink(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const [row] = await db().select({ id: socialConnectLinks.id, projectId: socialConnectLinks.projectId, expiresAt: socialConnectLinks.expiresAt, project: projects.titulo })
    .from(socialConnectLinks).innerJoin(projects, eq(projects.id, socialConnectLinks.projectId))
    .where(and(eq(socialConnectLinks.tokenHash, hash(token)), isNull(socialConnectLinks.revokedAt), gt(socialConnectLinks.expiresAt, now))).limit(1);
  return row ?? null;
}

export async function listConnectLinks(projectId: string) {
  return db().select({ id: socialConnectLinks.id, expiresAt: socialConnectLinks.expiresAt, revokedAt: socialConnectLinks.revokedAt, uses: socialConnectLinks.uses, lastUsedAt: socialConnectLinks.lastUsedAt, createdAt: socialConnectLinks.createdAt })
    .from(socialConnectLinks).where(eq(socialConnectLinks.projectId, projectId)).orderBy(desc(socialConnectLinks.createdAt)).limit(10);
}

export async function revokeConnectLink(id: string, actor: Actor) {
  const [row] = await db().update(socialConnectLinks).set({ revokedAt: new Date() }).where(and(eq(socialConnectLinks.id, id), isNull(socialConnectLinks.revokedAt))).returning({ projectId: socialConnectLinks.projectId });
  if (row) await logAudit("link-cancelado", actor, { projectId: row.projectId, detail: { linkId: id } });
  return !!row;
}

/** Contas que entraram por este link (quem tem o link só vê e desconecta o que ele mesmo conectou). */
export async function linkAccounts(linkId: string) {
  const conns = await db().select({ id: socialConnections.id }).from(socialConnections).where(eq(socialConnections.linkId, linkId));
  if (!conns.length) return [];
  return db().select({ id: socialAccounts.id, network: socialAccounts.network, name: socialAccounts.name, username: socialAccounts.username, pictureUrl: socialAccounts.pictureUrl, status: socialAccounts.status })
    .from(socialAccounts).where(inArray(socialAccounts.connectionId, conns.map((c) => c.id))).orderBy(socialAccounts.network, socialAccounts.name);
}

// ── cliente pessoal do Kayque ──────────────────────────────────────────────────
export const PERSONAL_CLIENT = "Kayque Brito (pessoal)";

/** O Kayque também é cliente: um projeto próprio para as contas pessoais, no mesmo fluxo dos outros. */
export async function ensurePersonalClient(adminId: string | null) {
  const [found] = await db().select({ id: projects.id }).from(projects).where(eq(projects.titulo, PERSONAL_CLIENT)).limit(1);
  if (found) return { id: found.id, created: false };
  const [row] = await db().insert(projects).values({ titulo: PERSONAL_CLIENT, categoria: "social", status: "producao", recurring: true }).returning({ id: projects.id });
  await logAudit("cliente-pessoal", { kind: "admin", userId: adminId }, { projectId: row.id });
  return { id: row.id, created: true };
}
