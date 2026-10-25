// Plano compartilhado do cliente principal: o principal tem o total do mês (ex.: 48) e cada operação a sua parte
// (ex.: 16 Hotel, 16 Lounge, 16 Praça). A gestão remaneja entre operações sem passar do total.
import { and, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "./db";
import { projects, socialPosts } from "./schema";
import { effectivePostLimit } from "./plan-limit";
import { monthRange } from "./content-cycle";

export class PoolError extends Error {}

async function used(ids: string[], month: string) {
  if (!ids.length) return new Map<string, number>();
  const { from, to } = monthRange(month);
  const rows = await db().select({ projectId: socialPosts.projectId }).from(socialPosts)
    .where(and(inArray(socialPosts.projectId, ids), isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt), ne(socialPosts.status, "cancelado"), gte(socialPosts.scheduledAt, from), lt(socialPosts.scheduledAt, to)));
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.projectId!, (m.get(r.projectId!) ?? 0) + 1);
  return m;
}

export type Pool = { rootId: string; titulo: string; limit: number | null; used: number; ops: { id: string; titulo: string; limit: number | null; used: number }[] };

/** Retrato do plano no mês: total do principal e parte de cada operação (o principal conta também os posts dele). */
export async function planPool(projectId: string, month: string): Promise<Pool | null> {
  const [p] = await db().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return null;
  const rootId = p.parentId ?? p.id;
  const [root] = rootId === p.id ? [p] : await db().select().from(projects).where(eq(projects.id, rootId)).limit(1);
  const kids = await db().select().from(projects).where(eq(projects.parentId, rootId));
  const u = await used([rootId, ...kids.map((k) => k.id)], month);
  return {
    rootId, titulo: root.titulo, limit: effectivePostLimit(root.categoria, root.postLimit),
    used: [...u.values()].reduce((s, n) => s + n, 0),
    ops: kids.map((k) => ({ id: k.id, titulo: k.titulo, limit: effectivePostLimit(k.categoria, k.postLimit), used: u.get(k.id) ?? 0 })).sort((a, b) => a.titulo.localeCompare(b.titulo)),
  };
}

/** Pode entrar mais um post neste projeto no mês? Confere a parte da operação e o total do principal. */
export async function assertRoom(projectId: string, month: string) {
  const pool = await planPool(projectId, month);
  if (!pool) throw new PoolError("Projeto não encontrado.");
  const op = pool.ops.find((o) => o.id === projectId);
  if (op && op.limit !== null && op.used >= op.limit) throw new PoolError(`${op.titulo} já tem ${op.used} posts neste mês, que é a parte dele no plano (${op.limit}). Remaneje de outra empresa ou escolha outro mês.`);
  if (pool.limit !== null && pool.used >= pool.limit) throw new PoolError(`Esse mês já tem ${pool.used} posts, que é o limite do plano (${pool.limit}). Escolha outro mês ou fale com o Kayque.`);
}

/** Remaneja as partes das operações. A soma não passa do total do principal. */
export async function setOperationLimits(rootId: string, limits: Record<string, number>) {
  const [root] = await db().select().from(projects).where(eq(projects.id, rootId)).limit(1);
  if (!root || root.parentId) throw new PoolError("Escolha o projeto principal.");
  const kids = await db().select().from(projects).where(eq(projects.parentId, rootId));
  const total = effectivePostLimit(root.categoria, root.postLimit);
  const next = new Map(kids.map((k) => [k.id, k.postLimit ?? 0]));
  for (const [id, n] of Object.entries(limits)) {
    if (!next.has(id)) throw new PoolError("Essa operação não é deste cliente.");
    if (!Number.isInteger(n) || n < 1 || n > 1000) throw new PoolError("Cada empresa precisa de pelo menos 1 post.");
    next.set(id, n);
  }
  const sum = [...next.values()].reduce((s, n) => s + n, 0);
  if (total !== null && sum > total) throw new PoolError(`A soma (${sum}) passa do plano (${total} por mês). Diminua de outra empresa.`);
  for (const [id, n] of Object.entries(limits)) await db().update(projects).set({ postLimit: n, updatedAt: new Date() }).where(eq(projects.id, id));
  return { total, sum };
}
