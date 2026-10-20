// Calendário de conteúdo no banco: importar, listar, editar (equipe) e aprovar (cliente no portal).
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "./db";
import { projects, socialPosts } from "./schema";
import { POST_FORMATS, POST_STATUS, parseIcs, type PostFormat, type PostStatus } from "./social-import";

export type Post = typeof socialPosts.$inferSelect;

const PORTAL_STATUS: PostStatus[] = ["aprovacao", "ajustes", "aprovado", "agendado", "postado"];

export async function previewImport(projectId: string, icsText: string) {
  const parsed = parseIcs(icsText, projectId);
  const have = new Set<string>();
  for (let i = 0; i < parsed.length; i += 500) {
    const rows = await db().select({ k: socialPosts.externalKey }).from(socialPosts).where(inArray(socialPosts.externalKey, parsed.slice(i, i + 500).map((p) => p.key)));
    for (const r of rows) if (r.k) have.add(r.k);
  }
  return { parsed, fresh: parsed.filter((p) => !have.has(p.key)), existing: parsed.length - parsed.filter((p) => !have.has(p.key)).length };
}

/** Cria só o que ainda não existe (chave estável); nunca sobrescreve edição nem status. */
export async function importPosts(projectId: string, icsText: string) {
  const [proj] = await db().select({ id: projects.id, contactId: projects.contactId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!proj) throw new Error("Projeto não encontrado.");
  const { fresh, parsed } = await previewImport(projectId, icsText);
  for (let i = 0; i < fresh.length; i += 100) {
    await db().insert(socialPosts).values(
      fresh.slice(i, i + 100).map((p) => ({
        projectId, contactId: proj.contactId, brand: p.brand, title: p.title, format: p.format,
        scheduledAt: p.scheduledAt, status: p.status, script: p.script, caption: p.caption, copies: p.copies, externalKey: p.key,
      })),
    ).onConflictDoNothing({ target: socialPosts.externalKey });
  }
  return { total: parsed.length, imported: fresh.length, skipped: parsed.length - fresh.length };
}

export async function listPosts(opts: { projectId?: string; from?: Date; to?: Date; status?: string } = {}) {
  const conds = [];
  if (opts.projectId) conds.push(eq(socialPosts.projectId, opts.projectId));
  if (opts.status && (POST_STATUS as readonly string[]).includes(opts.status)) conds.push(eq(socialPosts.status, opts.status));
  if (opts.from) conds.push(gte(socialPosts.scheduledAt, opts.from));
  if (opts.to) conds.push(lt(socialPosts.scheduledAt, opts.to));
  return db().select().from(socialPosts).where(conds.length ? and(...conds) : undefined).orderBy(asc(socialPosts.scheduledAt)).limit(1000);
}

export type PostPatch = Partial<{ title: string; brand: string | null; format: PostFormat; networks: string[]; scheduledAt: Date | null; status: PostStatus; script: string | null; caption: string | null; mediaUrl: string | null; postedUrl: string | null }>;

export class PostError extends Error {}

/** Edição da equipe. Mandar para aprovação exige o arquivo (link) para o cliente conseguir ver. */
export async function updatePost(id: string, patch: PostPatch) {
  const [cur] = await db().select().from(socialPosts).where(eq(socialPosts.id, id)).limit(1);
  if (!cur) throw new PostError("Post não encontrado.");
  if (patch.format && !(POST_FORMATS as readonly string[]).includes(patch.format)) throw new PostError("Formato inválido.");
  if (patch.status && !(POST_STATUS as readonly string[]).includes(patch.status)) throw new PostError("Status inválido.");
  const mediaUrl = patch.mediaUrl !== undefined ? patch.mediaUrl : cur.mediaUrl;
  if (patch.status === "aprovacao" && !mediaUrl) throw new PostError("Cole o link do arquivo (Drive, Lume…) antes de mandar para aprovação.");
  if (patch.status === "aprovacao" && !cur.projectId) throw new PostError("Esse post não está ligado a um projeto/cliente.");
  if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) throw new PostError("O link do arquivo precisa começar com https://.");
  const set: Partial<typeof socialPosts.$inferInsert> = { ...patch, updatedAt: new Date() };
  if (patch.status === "aprovacao") { set.decidedAt = null; set.decidedBy = null; set.clientNote = null; }
  const [row] = await db().update(socialPosts).set(set).where(eq(socialPosts.id, id)).returning();
  return { post: row, sentToApproval: patch.status === "aprovacao" && cur.status !== "aprovacao" };
}

/** O que o cliente enxerga: posts dos projetos dele, a partir de "aguardando aprovação". Sem roteiro interno. */
export async function portalPosts(userId: string) {
  const mine = await db().select({ id: projects.id }).from(projects).where(eq(projects.clienteId, userId));
  const ids = mine.map((p) => p.id);
  if (!ids.length) return [];
  return db()
    .select({ id: socialPosts.id, title: socialPosts.title, brand: socialPosts.brand, format: socialPosts.format, networks: socialPosts.networks, scheduledAt: socialPosts.scheduledAt, status: socialPosts.status, caption: socialPosts.caption, mediaUrl: socialPosts.mediaUrl, clientNote: socialPosts.clientNote })
    .from(socialPosts)
    .where(and(inArray(socialPosts.projectId, ids), inArray(socialPosts.status, PORTAL_STATUS)))
    .orderBy(asc(socialPosts.scheduledAt))
    .limit(200);
}

/** Decisão do cliente (só no post dele e só enquanto aguarda aprovação). */
export async function decidePost(userId: string, id: string, decision: "aprovar" | "ajustes", note?: string | null) {
  const [row] = await db()
    .select({ post: socialPosts, clienteId: projects.clienteId })
    .from(socialPosts)
    .leftJoin(projects, eq(projects.id, socialPosts.projectId))
    .where(eq(socialPosts.id, id))
    .limit(1);
  if (!row || row.clienteId !== userId) throw new PostError("Post não encontrado.");
  if (row.post.status !== "aprovacao") throw new PostError("Esse post não está aguardando aprovação.");
  const text = (note ?? "").trim().slice(0, 1000);
  if (decision === "ajustes" && !text) throw new PostError("Conte rapidamente o que precisa mudar.");
  const [out] = await db()
    .update(socialPosts)
    .set({ status: decision === "aprovar" ? "aprovado" : "ajustes", clientNote: text || null, decidedAt: new Date(), decidedBy: userId, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "aprovacao")))
    .returning();
  if (!out) throw new PostError("Esse post já foi decidido.");
  return out;
}
