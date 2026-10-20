// Calendário de conteúdo no banco: importar, listar, editar (equipe) e aprovar (cliente no portal).
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "./db";
import { projects, socialPosts } from "./schema";
import { POST_FORMATS, POST_STATUS, parseIcs, type PostFormat, type PostStatus } from "./social-import";

export type Post = typeof socialPosts.$inferSelect;

const DAY_MS = 86_400_000;
const PORTAL_STATUS: PostStatus[] = ["aprovacao", "ajustes", "aprovado", "agendado", "postado"]; // "erro" é interno

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

export async function listPosts(opts: { projectId?: string; from?: Date; to?: Date; status?: string; includeHidden?: boolean } = {}) {
  const conds = [];
  if (!opts.includeHidden) conds.push(isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt));
  if (opts.projectId) conds.push(eq(socialPosts.projectId, opts.projectId));
  if (opts.status && (POST_STATUS as readonly string[]).includes(opts.status)) conds.push(eq(socialPosts.status, opts.status));
  if (opts.from) conds.push(gte(socialPosts.scheduledAt, opts.from));
  if (opts.to) conds.push(lt(socialPosts.scheduledAt, opts.to));
  return db().select().from(socialPosts).where(conds.length ? and(...conds) : undefined).orderBy(asc(socialPosts.scheduledAt)).limit(1000);
}

export type PostPatch = Partial<{ title: string; brand: string | null; format: PostFormat; networks: string[]; scheduledAt: Date | null; status: PostStatus; script: string | null; caption: string | null; mediaUrl: string | null; postedUrl: string | null; scriptBy: string | null; captureBy: string | null; editor: string | null; errorMessage: string | null; dismissed: boolean }>;

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
  const { dismissed, ...fields } = patch;
  const set: Partial<typeof socialPosts.$inferInsert> = { ...fields, updatedAt: new Date() };
  if (dismissed !== undefined) set.dismissedAt = dismissed ? new Date() : null;
  if (patch.status === "aprovacao") { set.decidedAt = null; set.decidedBy = null; set.clientNote = null; }
  const [row] = await db().update(socialPosts).set(set).where(eq(socialPosts.id, id)).returning();
  return { post: row, sentToApproval: patch.status === "aprovacao" && cur.status !== "aprovacao" };
}

/** O que o cliente enxerga: posts dos projetos dele, a partir de "aguardando aprovação". Sem roteiro interno. */
export async function portalPosts(userId: string) {
  const mine = await db().select({ id: projects.id }).from(projects).where(eq(projects.clienteId, userId));
  const ids = mine.map((p) => p.id);
  if (!ids.length) return [];
  const rows = await db()
    .select({ id: socialPosts.id, title: socialPosts.title, brand: socialPosts.brand, format: socialPosts.format, networks: socialPosts.networks, scheduledAt: socialPosts.scheduledAt, status: socialPosts.status, caption: socialPosts.caption, mediaUrl: socialPosts.mediaUrl, clientNote: socialPosts.clientNote, script: socialPosts.script, createdBy: socialPosts.createdBy })
    .from(socialPosts)
    .where(and(inArray(socialPosts.projectId, ids), isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt), or(inArray(socialPosts.status, PORTAL_STATUS), eq(socialPosts.createdBy, userId))))
    .orderBy(asc(socialPosts.scheduledAt))
    .limit(300);
  // o roteiro interno nunca sai; só o que o próprio cliente escreveu volta para ele
  return rows.map(({ createdBy, script, ...p }) => ({ ...p, script: createdBy === userId ? script : null, mine: createdBy === userId }));
}

/** O cliente cadastra o roteiro dele pelo portal (data + formato + ideia). Vira "roteiro" no calendário da equipe. */
export async function createClientRoteiro(userId: string, input: { projectId: string; date: string; title: string; format: PostFormat; brand?: string | null; script?: string | null }) {
  const [proj] = await db().select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.clienteId, userId))).limit(1);
  if (!proj) throw new PostError("Projeto não encontrado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new PostError("Escolha o dia do post.");
  if (!(POST_FORMATS as readonly string[]).includes(input.format)) throw new PostError("Formato inválido.");
  const title = input.title.trim().slice(0, 200);
  if (title.length < 2) throw new PostError("Dê um título ao roteiro.");
  const [row] = await db().insert(socialPosts).values({
    projectId: proj.id, brand: input.brand?.trim().slice(0, 60) || null, title, format: input.format, scheduledAt: new Date(`${input.date}T00:00:00-03:00`),
    status: "roteiro", script: input.script?.trim().slice(0, 30000) || null, createdBy: userId,
  }).returning();
  return row;
}

// ── Vínculo roteiro ↔ post ───────────────────────────────────────────────────
const SCRIPT_STAGES: PostStatus[] = ["roteiro", "captacao", "producao"];

/** Roteiros que provavelmente deram origem a este post (mesma marca/formato, perto da data). */
export async function suggestScripts(postId: string) {
  const [post] = await db().select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!post || !post.projectId) return [];
  const center = post.scheduledAt?.getTime() ?? Date.now();
  const rows = await db().select().from(socialPosts).where(and(eq(socialPosts.projectId, post.projectId), isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt), inArray(socialPosts.status, SCRIPT_STAGES))).limit(1000);
  return rows
    .filter((r) => r.id !== post.id && r.scheduledAt && Math.abs(r.scheduledAt.getTime() - center) <= 21 * DAY_MS)
    .map((r) => ({ r, score: (r.brand && post.brand && r.brand === post.brand ? 3 : r.brand && post.brand ? -3 : 0) + (r.format === post.format ? 2 : 0) + (r.script ? 1 : 0) - Math.abs(r.scheduledAt!.getTime() - center) / DAY_MS / 7 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ r }) => ({ id: r.id, title: r.title, brand: r.brand, format: r.format, status: r.status, scheduledAt: r.scheduledAt, hasScript: !!r.script, scriptBy: r.scriptBy }));
}

/** Liga o roteiro ao post: o texto e a equipe passam para o post; o roteiro sai das listas e dos atrasados. */
export async function linkScript(scriptId: string, targetId: string) {
  if (scriptId === targetId) throw new PostError("Escolha um roteiro diferente do post.");
  const [sc] = await db().select().from(socialPosts).where(eq(socialPosts.id, scriptId)).limit(1);
  const [tg] = await db().select().from(socialPosts).where(eq(socialPosts.id, targetId)).limit(1);
  if (!sc || !tg) throw new PostError("Post não encontrado.");
  if (sc.projectId !== tg.projectId) throw new PostError("Os dois precisam ser do mesmo projeto.");
  if (sc.linkedTo) throw new PostError("Esse roteiro já está ligado a outro post.");
  const [out] = await db().update(socialPosts).set({
    script: tg.script ?? sc.script, scriptBy: tg.scriptBy ?? sc.scriptBy, captureBy: tg.captureBy ?? sc.captureBy, editor: tg.editor ?? sc.editor, createdBy: tg.createdBy ?? sc.createdBy, updatedAt: new Date(),
  }).where(eq(socialPosts.id, targetId)).returning();
  await db().update(socialPosts).set({ linkedTo: targetId, updatedAt: new Date() }).where(eq(socialPosts.id, scriptId));
  return out;
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

// ── Atrasados ──────────────────────────────────────────────────────────────────
const belemMidnight = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "America/Belem", hour12: false }) === "00:00:00";

/** Prazo real do post: horário 00:00 é só "o dia" (planejamento) e vence ao fim dele. */
export function postDeadline(scheduledAt: Date) {
  return belemMidnight(scheduledAt) ? new Date(scheduledAt.getTime() + DAY_MS) : scheduledAt;
}

export function isOverdue(p: { scheduledAt: Date | null; status: string }, now = new Date()) {
  return !!p.scheduledAt && p.status !== "postado" && postDeadline(p.scheduledAt) < now;
}

const firstToken = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** A equipe é texto livre no post ("Léo"): casa com o primeiro nome do usuário. */
export function isResponsible(p: { scriptBy: string | null; captureBy: string | null; editor: string | null }, userName: string) {
  const me = norm(firstToken(userName));
  if (me.length < 2) return false;
  return [p.scriptBy, p.captureBy, p.editor].some((n) => n && norm(n).split(/\s+/).includes(me));
}

export type OverdueItem = { id: string; title: string; brand: string | null; status: string; scheduledAt: Date; daysLate: number; waitingClient: boolean; mine: boolean; people: string | null };

/** Posts atrasados visíveis para quem está logado: cliente (só os dele), equipe (os seus) e admin (todos). */
export async function overduePosts(user: { id: string; name: string; role: string }, now = new Date()): Promise<OverdueItem[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const rows = await db().select().from(socialPosts).where(and(gte(socialPosts.scheduledAt, since), lt(socialPosts.scheduledAt, now), isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt))).orderBy(asc(socialPosts.scheduledAt)).limit(500);
  let allowed: Set<string> | null = null;
  if (user.role === "cliente") {
    const mine = await db().select({ id: projects.id }).from(projects).where(eq(projects.clienteId, user.id));
    allowed = new Set(mine.map((p) => p.id));
  }
  const out: OverdueItem[] = [];
  for (const p of rows) {
    if (!isOverdue(p, now) || !p.scheduledAt) continue;
    const mine = isResponsible(p, user.name);
    if (user.role === "cliente") {
      if (!p.projectId || !allowed!.has(p.projectId) || !PORTAL_STATUS.includes(p.status as PostStatus)) continue;
    } else if (user.role !== "admin" && !mine) continue;
    out.push({
      id: p.id, title: p.title, brand: p.brand, status: p.status, scheduledAt: p.scheduledAt,
      daysLate: Math.max(0, Math.floor((now.getTime() - postDeadline(p.scheduledAt).getTime()) / DAY_MS)),
      waitingClient: p.status === "aprovacao", mine,
      people: user.role === "cliente" ? null : [p.scriptBy, p.captureBy, p.editor].filter(Boolean).join(" · ") || null,
    });
  }
  return out;
}
