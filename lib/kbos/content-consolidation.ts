import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { dataMoves, postPublications, socialPosts } from "./schema";
import { projectFamily } from "./project-family";
import { normalizeContent } from "./social-identity";
import { reviewContent } from "./social-reconciliation";
import type { Post } from "./social-posts";

type Publication = typeof postPublications.$inferSelect;
const order = ["roteiro", "captacao", "producao", "aprovacao", "ajustes", "aprovado", "agendado", "erro", "postado"];
const fields = ["script", "caption", "mediaUrl", "postedUrl", "scriptBy", "captureBy", "editor", "clientNote", "decidedBy", "errorMessage"] as const;
const text = (s: string) => s.replace(/\r\n/g, "\n").trim();
export class ConsolidationError extends Error {}

/** Só igualdade de identidade + campos iguais/complementares; nenhum vínculo ou publicação é apagado. */
export function consolidationPlan(rows: Post[], publications: Publication[]) {
  return reviewContent(rows).groups.map(group => {
    const posts = group.items.map(item => rows.find(p => p.id === item.id)!);
    const pubIds = new Set(publications.map(p => p.postId));
    const ranked = [...posts].sort((a, b) => Number(pubIds.has(b.id)) - Number(pubIds.has(a.id)) || order.indexOf(b.status) - order.indexOf(a.status) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const keeper = ranked[0];
    const conflicts: string[] = [];
    const scripts = posts.map(p => p.script).filter((v): v is string => !!v).map(text).sort((a,b) => b.length-a.length);
    const extendedScript = scripts.length > 0 && scripts.every(s => scripts[0].startsWith(s));
    for (const key of fields) if (new Set(posts.map(p => p[key]).filter((v): v is string => !!v).map(text)).size > 1 && !(key === "script" && extendedScript)) conflicts.push(key);
    if (new Set(posts.map(p => JSON.stringify(p.takes)).filter(v => v !== "[]")).size > 1) conflicts.push("takes");
    if (new Set(posts.map(p => p.createdBy).filter(Boolean)).size > 1) conflicts.push("createdBy");
    if (new Set(posts.map(p => p.decidedAt?.toISOString()).filter(Boolean)).size > 1) conflicts.push("decidedAt");
    if (posts.some(p => p.status === "cancelado")) conflicts.push("cancelado");
    if (posts.some(p => p.id !== keeper.id && pubIds.has(p.id))) conflicts.push("publicações em mais de um registro");
    if (rows.some(p => p.linkedTo && posts.some(candidate => candidate.id === p.linkedTo))) conflicts.push("vínculos existentes");
    // Títulos unidos apenas por legenda não bastam para consolidar automaticamente.
    const captions = posts.map(p => normalizeContent(p.caption ?? ""));
    const sameCaption = captions[0].length > 0 && captions.every(c => c === captions[0]);
    const captionTitles = sameCaption && posts.every(p => captions[0].startsWith(normalizeContent(p.title).replace(/[.\u2026]+$/, "").trim()));
    if (new Set(posts.map(p => text(p.title).toLocaleLowerCase())).size > 1 && !captionTitles) conflicts.push("títulos diferentes");
    const formats = [...new Set(posts.map(p => p.format).filter(f => f !== "outro"))];
    if (new Set(posts.map(p => p.format)).size > 1 && !(captionTitles && formats.length === 1)) conflicts.push("formatos diferentes");
    const patch: Partial<Post> = {};
    for (const key of fields) if (!keeper[key]) patch[key] = posts.find(p => !!p[key])?.[key] ?? null;
    if (extendedScript && scripts[0].length > text(keeper.script ?? "").length) patch.script = posts.find(p => p.script && text(p.script) === scripts[0])!.script;
    if (captionTitles && formats.length === 1) patch.format = formats[0];
    if (!keeper.takes.length) patch.takes = posts.find(p => p.takes.length)?.takes ?? [];
    if (!keeper.createdBy) patch.createdBy = posts.find(p => p.createdBy)?.createdBy ?? null;
    if (!keeper.decidedAt) patch.decidedAt = posts.find(p => p.decidedAt)?.decidedAt ?? null;
    // Redes são distribuição comprovada, não o número de cópias do ICS.
    const differentNetworks = posts.some(p => p.id !== keeper.id && p.networks.some(n => !keeper.networks.includes(n)));
    if (differentNetworks) conflicts.push("redes diferentes");
    const targetStatus = posts.reduce((best, p) => order.indexOf(p.status) > order.indexOf(best) ? p.status : best, keeper.status);
    if (pubIds.has(keeper.id) && targetStatus !== keeper.status) conflicts.push("etapa diverge da distribuição");
    patch.status = targetStatus;
    const version = createHash("sha256").update(JSON.stringify({ posts: [...posts].sort((a,b) => a.id.localeCompare(b.id)), publications: publications.filter(p => posts.some(row => row.id === p.postId)) })).digest("hex");
    return { ...group, keeperId: keeper.id, sourceIds: posts.filter(p => p.id !== keeper.id).map(p => p.id), version, conflicts, safe: conflicts.length === 0, patch, before: posts };
  });
}

export async function consolidationFor(projectId: string, month: string) {
  const ids = (await projectFamily(projectId)).ids;
  const rows = await db().select().from(socialPosts).where(inArray(socialPosts.projectId, ids));
  const pubs = rows.length ? await db().select().from(postPublications).where(inArray(postPublications.postId, rows.map(p => p.id))) : [];
  const inMonth = rows.filter(p => p.scheduledAt?.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).startsWith(month));
  return consolidationPlan(inMonth, pubs);
}

/** Snapshot e alterações na mesma instrução SQL; trava e comparação integral impedem concorrência parcial. */
export async function applyConsolidation(projectId: string, month: string, keeperId: string, version: string, userId: string) {
  const group = (await consolidationFor(projectId, month)).find(g => g.keeperId === keeperId && g.version === version);
  if (!group || !group.safe) throw new ConsolidationError("Os registros mudaram ou há divergências. Atualize a conferência.");
  const ids = group.before.map(p => p.id);
  const patch = group.patch;
  const keeper = group.before.find(p => p.id === keeperId)!;
  const afterKeeper = { ...keeper, ...patch };
  const beforeDb = group.before.map(p => ({ id: p.id, updatedAt: p.updatedAt.toISOString() }));
  const payload = { projectId, month, before: group.before, keeperId, sourceIds: group.sourceIds, patch };
  const result = await db().execute(sql`
    WITH locked AS MATERIALIZED (SELECT * FROM kbos_social_posts WHERE id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`,`)}) ORDER BY id FOR UPDATE),
    valid AS (SELECT 1 WHERE (SELECT count(*) FROM locked l JOIN jsonb_to_recordset(${JSON.stringify(beforeDb)}::jsonb) AS b(id uuid, "updatedAt" timestamptz) ON b.id=l.id AND b."updatedAt"=date_trunc('milliseconds',l.updated_at) WHERE l.linked_to IS NULL AND l.dismissed_at IS NULL) = ${ids.length}
      AND NOT EXISTS (SELECT 1 FROM kbos_post_publications WHERE post_id IN (${sql.join(group.sourceIds.map(id => sql`${id}::uuid`), sql`,`)}))),
    audit AS (INSERT INTO kbos_data_moves(kind,payload,created_by) SELECT 'consolidar-conteudos', ${JSON.stringify(payload)}::jsonb, ${userId}::uuid FROM valid RETURNING id),
    merged AS (UPDATE kbos_social_posts SET script=${afterKeeper.script}, caption=${afterKeeper.caption}, media_url=${afterKeeper.mediaUrl}, posted_url=${afterKeeper.postedUrl}, script_by=${afterKeeper.scriptBy}, capture_by=${afterKeeper.captureBy}, editor=${afterKeeper.editor}, client_note=${afterKeeper.clientNote}, decided_by=${afterKeeper.decidedBy}::uuid, error_message=${afterKeeper.errorMessage}, takes=${JSON.stringify(afterKeeper.takes)}::jsonb, created_by=${afterKeeper.createdBy}::uuid, decided_at=${afterKeeper.decidedAt?.toISOString() ?? null}::timestamptz, status=${afterKeeper.status}, format=${afterKeeper.format}, updated_at=now() WHERE id=${keeperId}::uuid AND EXISTS(SELECT 1 FROM audit) RETURNING id),
    linked AS (UPDATE kbos_social_posts SET linked_to=${keeperId}::uuid, updated_at=now() WHERE id IN (${sql.join(group.sourceIds.map(id => sql`${id}::uuid`), sql`,`)}) AND EXISTS(SELECT 1 FROM merged) RETURNING id)
    SELECT audit.id, (SELECT count(*) FROM linked) AS consolidated FROM audit`);
  const out = result.rows[0];
  if (!out) throw new ConsolidationError("Conflito com outra edição. Nada foi consolidado.");
  return { moveId: out.id, consolidated: Number(out.consolidated) };
}

/** Desfaz somente campos alterados pela consolidação, recusando edições posteriores nos registros envolvidos. */
export async function revertConsolidation(moveId: string) {
  const [log] = await db().select().from(dataMoves).where(and(eq(dataMoves.id, moveId), eq(dataMoves.kind, "consolidar-conteudos"))).limit(1);
  if (!log || log.revertedAt) throw new ConsolidationError("Consolidação não encontrada ou já desfeita.");
  const payload = log.payload as unknown as { before: Post[]; keeperId: string; sourceIds: string[] };
  const ids = payload.before.map(p => p.id);
  const rows = await db().select().from(socialPosts).where(inArray(socialPosts.id, ids));
  // now() da instrução de consolidação é a mesma nos envolvidos e na auditoria.
  if (rows.length !== ids.length || rows.some(p => p.updatedAt.getTime() !== log.createdAt.getTime())) throw new ConsolidationError("Há edições posteriores. Revise antes de desfazer para preservá-las.");
  const before = payload.before.map(p => ({ id: p.id, script: p.script, caption: p.caption, media_url: p.mediaUrl, posted_url: p.postedUrl, script_by: p.scriptBy, capture_by: p.captureBy, editor: p.editor, client_note: p.clientNote, decided_by: p.decidedBy, error_message: p.errorMessage, takes: p.takes, created_by: p.createdBy, decided_at: p.decidedAt, status: p.status, format: p.format, linked_to: p.linkedTo }));
  const result = await db().execute(sql`
    WITH locked AS MATERIALIZED (SELECT * FROM kbos_social_posts WHERE id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`,`)}) ORDER BY id FOR UPDATE),
    valid AS (SELECT 1 WHERE (SELECT count(*) FROM locked WHERE updated_at = (SELECT created_at FROM kbos_data_moves WHERE id=${moveId}::uuid AND reverted_at IS NULL))=${ids.length}),
    restored AS (UPDATE kbos_social_posts p SET script=b.script,caption=b.caption,media_url=b.media_url,posted_url=b.posted_url,script_by=b.script_by,capture_by=b.capture_by,editor=b.editor,client_note=b.client_note,decided_by=b.decided_by,error_message=b.error_message,takes=b.takes,created_by=b.created_by,decided_at=b.decided_at,status=b.status,format=b.format,linked_to=b.linked_to,updated_at=now() FROM jsonb_populate_recordset(NULL::kbos_social_posts,${JSON.stringify(before)}::jsonb) b WHERE p.id=b.id AND EXISTS(SELECT 1 FROM valid) RETURNING p.id),
    audit AS (UPDATE kbos_data_moves SET reverted_at=now() WHERE id=${moveId}::uuid AND (SELECT count(*) FROM restored)=${ids.length} RETURNING id) SELECT * FROM audit`);
  if (!result.rows.length) throw new ConsolidationError("Conflito com outra edição. Nada foi desfeito.");
  return { restored: ids.length };
}
