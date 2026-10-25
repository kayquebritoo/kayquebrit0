// Separar um projeto que mistura empresas (ex.: Grupo VIP com Hotel/Lounge/Praça no campo `brand`)
// em operações filhas. Regra: só move post com marca EXATA; sem marca fica no principal para revisão.
// Nada é apagado: cada aplicação grava em `kbos_data_moves` o que precisa para desfazer.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { dataMoves, projectFiles, projectMembers, projects, socialPosts, tasks } from "./schema";

type Row = { id: string; brand: string | null; status: string; scheduledAt: Date | null; linkedTo: string | null; dismissedAt: Date | null };
const month = (d: Date | null) => d?.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).slice(0, 7) ?? null;

/** Diagnóstico puro (somente leitura): quantos posts iriam para cada operação. */
export function splitPlan(rows: Row[]) {
  const brands = new Map<string, Row[]>();
  for (const r of rows) if (r.brand?.trim()) brands.set(r.brand.trim(), [...(brands.get(r.brand.trim()) ?? []), r]);
  return {
    total: rows.length,
    semMarca: rows.filter((r) => !r.brand?.trim()).length,
    marcas: [...brands.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([brand, list]) => {
      const months = list.map((r) => month(r.scheduledAt)).filter((m): m is string => !!m).sort();
      const porStatus: Record<string, number> = {};
      for (const r of list) porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
      return { brand, total: list.length, ocultos: list.filter((r) => r.linkedTo || r.dismissedAt).length, porStatus, de: months[0] ?? null, ate: months.at(-1) ?? null };
    }),
  };
}

export class SplitError extends Error {}

export async function planFor(parentId: string) {
  const [parent] = await db().select().from(projects).where(eq(projects.id, parentId)).limit(1);
  if (!parent) throw new SplitError("Projeto não encontrado.");
  const rows = await db().select({ id: socialPosts.id, brand: socialPosts.brand, status: socialPosts.status, scheduledAt: socialPosts.scheduledAt, linkedTo: socialPosts.linkedTo, dismissedAt: socialPosts.dismissedAt }).from(socialPosts).where(eq(socialPosts.projectId, parentId));
  const children = await db().select({ id: projects.id, titulo: projects.titulo }).from(projects).where(eq(projects.parentId, parentId));
  const moves = await db().select({ id: dataMoves.id, createdAt: dataMoves.createdAt, payload: dataMoves.payload }).from(dataMoves)
    .where(and(eq(dataMoves.kind, "separar-operacoes"), isNull(dataMoves.revertedAt), sql`${dataMoves.payload}->>'parentId' = ${parentId}`));
  return {
    parent: { id: parent.id, titulo: parent.titulo, parentId: parent.parentId }, children, ...splitPlan(rows),
    desfazer: moves.map((m) => ({ id: m.id, createdAt: m.createdAt, moved: ((m.payload as { moves?: unknown[] }).moves ?? []).length })),
  };
}

type Move = { postId: string; from: string; to: string };

/**
 * Aplica (só com confirmação explícita na rota): cria ou reaproveita a operação de cada marca e move os posts dela.
 * Posts ocultos (vinculados/dispensados) vão junto para o vínculo não se separar do post.
 */
export async function applySplit(parentId: string, mapping: { brand: string; titulo: string }[], userId: string | null) {
  const plan = await planFor(parentId);
  if (plan.parent.parentId) throw new SplitError("Esse projeto já é uma operação; separe a partir do principal.");
  const known = new Set(plan.marcas.map((m) => m.brand));
  const clean = mapping.map((m) => ({ brand: m.brand.trim(), titulo: m.titulo.trim().slice(0, 160) })).filter((m) => m.brand && m.titulo);
  if (!clean.length) throw new SplitError("Diga qual marca vira qual operação.");
  for (const m of clean) if (!known.has(m.brand)) throw new SplitError(`Não há posts com a marca "${m.brand}" neste projeto.`);
  const [parent] = await db().select().from(projects).where(eq(projects.id, parentId)).limit(1);
  const created: string[] = [];
  const moves: Move[] = [];
  for (const m of clean) {
    let child = plan.children.find((c) => c.titulo.toLowerCase() === m.titulo.toLowerCase());
    if (!child) {
      const [row] = await db().insert(projects).values({
        titulo: m.titulo, categoria: parent.categoria, parentId, recurring: true, contactId: parent.contactId, status: parent.status === "entregue" ? "producao" : parent.status,
      }).returning({ id: projects.id, titulo: projects.titulo });
      child = row; created.push(row.id);
    }
    const moved = await db().update(socialPosts).set({ projectId: child.id, updatedAt: new Date() })
      .where(and(eq(socialPosts.projectId, parentId), eq(socialPosts.brand, m.brand))).returning({ id: socialPosts.id });
    moves.push(...moved.map((p) => ({ postId: p.id, from: parentId, to: child!.id })));
  }
  const [log] = await db().insert(dataMoves).values({ kind: "separar-operacoes", payload: { parentId, mapping: clean, created, moves }, createdBy: userId }).returning();
  return { moveId: log.id, created: created.length, moved: moves.length };
}

/** Desfaz: devolve cada post ao projeto de origem (só se ainda estiver onde a separação deixou) e apaga as operações criadas que ficaram vazias. */
export async function revertSplit(moveId: string) {
  const [log] = await db().select().from(dataMoves).where(and(eq(dataMoves.id, moveId), isNull(dataMoves.revertedAt))).limit(1);
  if (!log || log.kind !== "separar-operacoes") throw new SplitError("Movimentação não encontrada ou já desfeita.");
  const { moves, created } = log.payload as { moves: Move[]; created: string[] };
  let back = 0;
  for (const to of [...new Set(moves.map((m) => m.to))]) {
    const ids = moves.filter((m) => m.to === to).map((m) => m.postId);
    for (let i = 0; i < ids.length; i += 200) {
      const r = await db().update(socialPosts).set({ projectId: moves[0].from, updatedAt: new Date() }).where(and(inArray(socialPosts.id, ids.slice(i, i + 200)), eq(socialPosts.projectId, to))).returning({ id: socialPosts.id });
      back += r.length;
    }
  }
  let removed = 0;
  for (const id of created) {
    const [post] = await db().select({ id: socialPosts.id }).from(socialPosts).where(eq(socialPosts.projectId, id)).limit(1);
    const [task] = await db().select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id)).limit(1);
    const [member] = await db().select({ id: projectMembers.id }).from(projectMembers).where(eq(projectMembers.projectId, id)).limit(1);
    const [file] = await db().select({ id: projectFiles.id }).from(projectFiles).where(eq(projectFiles.projectId, id)).limit(1);
    if (!post && !task && !member && !file) { await db().delete(projects).where(eq(projects.id, id)); removed++; }
  }
  await db().update(dataMoves).set({ revertedAt: new Date() }).where(eq(dataMoves.id, moveId));
  return { back, removed };
}
