// Publicar pelo KBOS (fase 3): contas conectadas, agendar por rede e o verificador (`social.tick`, 1 min) que publica
// o que venceu. Cada publicação é travada (`sending_at`) antes do envio: dois verificadores nunca postam o mesmo.
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "./db";
import { postPublications, projects, socialAccounts, socialPosts } from "./schema";
import { seal, unseal } from "./social-crypto";
import { MetaError, publishFacebook, publishInstagram, type MetaAccount, type PublishInput, type PublishResult } from "./meta";
import { listMedia, publicMediaUrl } from "./social-media";
import { updatePublication } from "./content-cycle";

export const PUBLISHABLE = ["instagram", "facebook"] as const;
export class PublishError extends Error {}

// ── contas ─────────────────────────────────────────────────────────────────────
/** Guarda (ou renova) as contas que vieram do login da Meta. Não mexe no projeto já escolhido. */
export async function saveMetaAccounts(accounts: MetaAccount[], userId: string | null) {
  for (const a of accounts) {
    const values = { network: a.network, externalId: a.externalId, pageId: a.pageId, name: a.name, username: a.username, pictureUrl: a.pictureUrl, tokenEnc: seal(a.token), status: "ativo", lastError: null, connectedBy: userId, updatedAt: new Date() };
    await db().insert(socialAccounts).values(values).onConflictDoUpdate({ target: [socialAccounts.network, socialAccounts.externalId], set: values });
  }
  return accounts.length;
}

export async function listAccounts() {
  return db().select({ id: socialAccounts.id, projectId: socialAccounts.projectId, network: socialAccounts.network, name: socialAccounts.name, username: socialAccounts.username, pictureUrl: socialAccounts.pictureUrl, status: socialAccounts.status, lastError: socialAccounts.lastError, updatedAt: socialAccounts.updatedAt })
    .from(socialAccounts).orderBy(asc(socialAccounts.network), asc(socialAccounts.name));
}

export async function assignAccount(id: string, projectId: string | null) {
  const [row] = await db().update(socialAccounts).set({ projectId, updatedAt: new Date() }).where(eq(socialAccounts.id, id)).returning({ id: socialAccounts.id });
  return !!row;
}

export async function removeAccount(id: string) {
  await db().update(postPublications).set({ accountId: null }).where(eq(postPublications.accountId, id));
  await db().delete(socialAccounts).where(eq(socialAccounts.id, id));
}

/** Conta da rede para o projeto: a da operação; se ela não tiver, a do principal. */
export async function accountFor(projectId: string, network: string) {
  const [p] = await db().select({ parentId: projects.parentId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const ids = [projectId, ...(p?.parentId ? [p.parentId] : [])];
  const rows = await db().select().from(socialAccounts).where(and(inArray(socialAccounts.projectId, ids), eq(socialAccounts.network, network)));
  return rows.find((r) => r.projectId === projectId) ?? rows[0] ?? null;
}

// ── agendar ────────────────────────────────────────────────────────────────────
/**
 * Põe as redes do post na fila do KBOS: `at` = agora (publicar já) ou a data do post.
 * Confere antes o que faria a publicação falhar (arquivo, conta, data).
 */
export async function schedulePost(postId: string, opts: { at: Date; networks?: string[] }) {
  const [post] = await db().select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!post?.projectId) throw new PublishError("Esse post não está ligado a um projeto.");
  if (post.status === "cancelado") throw new PublishError("Esse post está cancelado.");
  const media = (await listMedia(postId)).filter((m) => m.status === "pronto");
  if (!media.length) throw new PublishError("Envie o arquivo final (JPG ou MP4) antes de agendar.");
  const pubs = await db().select().from(postPublications).where(eq(postPublications.postId, postId));
  const targets = pubs.filter((p) => (PUBLISHABLE as readonly string[]).includes(p.network) && p.status !== "publicado" && p.status !== "cancelado" && (!opts.networks || opts.networks.includes(p.network)));
  if (!targets.length) throw new PublishError("Marque Instagram e/ou Facebook nas redes do post.");
  const missing: string[] = [];
  for (const p of targets) {
    const acc = await accountFor(post.projectId, p.network);
    if (!acc) { missing.push(p.network); continue; }
    await db().update(postPublications).set({ status: "agendado", scheduledAt: opts.at, accountId: acc.id, error: null, attempts: 0, sendingAt: null, updatedAt: new Date() }).where(eq(postPublications.id, p.id));
  }
  if (missing.length) throw new PublishError(`Falta ligar a conta de ${missing.join(" e ")} a este projeto (Ajustes → Redes sociais).`);
  if (["roteiro", "captacao", "producao", "aprovacao", "ajustes", "aprovado"].includes(post.status)) {
    await db().update(socialPosts).set({ status: "agendado", updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  }
  return targets.length;
}

/** Tira da fila do KBOS (volta a pendente). Só o que ainda não saiu. */
export async function unschedulePost(postId: string) {
  const r = await db().update(postPublications).set({ status: "pendente", scheduledAt: null, updatedAt: new Date() })
    .where(and(eq(postPublications.postId, postId), eq(postPublications.status, "agendado"), isNull(postPublications.sendingAt))).returning({ id: postPublications.id });
  return r.length;
}

// ── enviar ─────────────────────────────────────────────────────────────────────
const LOCK_MS = 20 * 60_000;
const MAX_ATTEMPTS = 3;
type Publisher = (network: string, account: { externalId: string; pageId: string | null; token: string }, input: PublishInput) => Promise<PublishResult>;
const metaPublisher: Publisher = (network, acc, input) => (network === "instagram" ? publishInstagram(acc.externalId, acc.token, input) : publishFacebook(acc.pageId ?? acc.externalId, acc.token, input));

/** Trava e publica uma publicação. Devolve o que aconteceu (para o diário do worker e os testes). */
export async function sendPublication(pubId: string, now = new Date(), publish: Publisher = metaPublisher) {
  const [claimed] = await db().update(postPublications)
    .set({ sendingAt: now, attempts: sql`${postPublications.attempts} + 1`, updatedAt: now })
    .where(and(eq(postPublications.id, pubId), eq(postPublications.status, "agendado"), or(isNull(postPublications.sendingAt), lt(postPublications.sendingAt, new Date(now.getTime() - LOCK_MS)))))
    .returning();
  if (!claimed) return { id: pubId, result: "ocupado" as const };
  const fail = async (message: string, final: boolean) => {
    if (final) await updatePublication(claimed.postId, claimed.network, { status: "erro", error: message.slice(0, 500) });
    await db().update(postPublications).set({ sendingAt: null, ...(final ? {} : { error: message.slice(0, 500) }), updatedAt: new Date() }).where(eq(postPublications.id, pubId));
    return { id: pubId, result: final ? ("erro" as const) : ("tentar-de-novo" as const), message };
  };
  try {
    const [post] = await db().select().from(socialPosts).where(eq(socialPosts.id, claimed.postId)).limit(1);
    if (!post || post.status === "cancelado") return await fail("Post cancelado ou apagado.", true);
    const [acc] = claimed.accountId ? await db().select().from(socialAccounts).where(eq(socialAccounts.id, claimed.accountId)).limit(1) : [];
    if (!acc) return await fail("Conta da rede não está mais ligada. Reconecte em Ajustes → Redes sociais.", true);
    if (acc.status !== "ativo") return await fail("A conexão com a rede expirou. Reconecte em Ajustes → Redes sociais.", true);
    const media = (await listMedia(post.id)).filter((m) => m.status === "pronto").map((m) => ({ kind: m.kind as "image" | "video", url: publicMediaUrl(m.publicToken, m.name) }));
    const out = await publish(claimed.network, { externalId: acc.externalId, pageId: acc.pageId, token: unseal(acc.tokenEnc) }, { format: post.format, caption: post.caption ?? "", media });
    await updatePublication(post.id, claimed.network, { status: "publicado", url: out.url });
    await db().update(postPublications).set({ externalId: out.externalId, sendingAt: null, error: null }).where(eq(postPublications.id, pubId));
    if (out.url && !post.postedUrl) await db().update(socialPosts).set({ postedUrl: out.url }).where(eq(socialPosts.id, post.id));
    return { id: pubId, result: "publicado" as const, url: out.url };
  } catch (e) {
    if (e instanceof MetaError) {
      if (e.expired && claimed.accountId) await db().update(socialAccounts).set({ status: "expirado", lastError: e.message.slice(0, 500), updatedAt: new Date() }).where(eq(socialAccounts.id, claimed.accountId));
      // erro de conteúdo/permissão não melhora tentando de novo
      return await fail(e.message, true);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return await fail(`Falha de conexão: ${msg}`, claimed.attempts >= MAX_ATTEMPTS);
  }
}

/** Verificador (1 min): publica o que já venceu. Poucas por vez; o resto fica para o próximo minuto. */
export async function handleSocialTick(now = new Date(), publish?: Publisher) {
  const due = await db().select({ id: postPublications.id }).from(postPublications)
    .where(and(eq(postPublications.status, "agendado"), lte(postPublications.scheduledAt, now), or(isNull(postPublications.sendingAt), lt(postPublications.sendingAt, new Date(now.getTime() - LOCK_MS)))))
    .orderBy(asc(postPublications.scheduledAt)).limit(5);
  const out = [];
  for (const d of due) out.push(await sendPublication(d.id, now, publish));
  return out;
}
