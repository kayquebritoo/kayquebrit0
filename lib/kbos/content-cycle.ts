// Conteúdo × publicações × ciclo mensal.
// Regra de ouro: a ENTREGA é o conteúdo produzido (1 Reels = 1 entrega), não cada rede em que ele sai.
// Cada rede tem o próprio status em `kbos_post_publications`; a fase geral do conteúdo é derivada aqui.
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "./db";
import { postPublications, projectCycles, projects, socialPosts } from "./schema";
import { effectivePostLimit } from "./plan-limit";

export const PHASES = ["planejado", "producao", "aprovacao", "aprovado", "agendado", "publicado", "cancelado"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = {
  planejado: "Planejado", producao: "Em produção", aprovacao: "Aguardando aprovação", aprovado: "Aprovado",
  agendado: "Agendado", publicado: "Publicado", cancelado: "Cancelado",
};

export const PUB_STATUS = ["pendente", "agendado", "publicado", "erro", "cancelado"] as const;
export type PubStatus = (typeof PUB_STATUS)[number];

type PostLike = { status: string; scheduledAt: Date | null; networks?: string[] | null };
type PubLike = { network: string; status: string };

const ORDER = (p: Phase) => PHASES.indexOf(p);

const BY_STATUS: Record<string, Phase> = {
  roteiro: "planejado", captacao: "producao", producao: "producao", aprovacao: "aprovacao", ajustes: "aprovacao",
  aprovado: "aprovado", agendado: "agendado", postado: "publicado", erro: "agendado", cancelado: "cancelado",
};

export type ContentState = { phase: Phase; published: number; networks: number; partial: boolean; failed: number };

/**
 * Fase geral do conteúdo. Com publicações por rede, "publicado" só quando TODAS as redes ativas saíram;
 * se só parte saiu, fica "agendado" com `partial`. Sem publicações cadastradas, vale o status do post (legado).
 */
export function contentState(post: PostLike, pubs: PubLike[] = []): ContentState {
  if (post.status === "cancelado") return { phase: "cancelado", published: 0, networks: 0, partial: false, failed: 0 };
  const active = pubs.filter((p) => p.status !== "cancelado");
  const base = BY_STATUS[post.status] ?? "planejado";
  if (active.length === 0) return { phase: base, published: base === "publicado" ? 1 : 0, networks: 0, partial: false, failed: post.status === "erro" ? 1 : 0 };
  const published = active.filter((p) => p.status === "publicado").length;
  const failed = active.filter((p) => p.status === "erro").length;
  const scheduled = active.filter((p) => p.status === "agendado").length;
  let phase: Phase = base;
  if (published === active.length) phase = "publicado";
  // parte das redes já saiu ou está na fila: agendado; o post dizer "postado" com rede pendente também (não presumir)
  else if ((published > 0 || scheduled > 0) && ORDER(base) >= ORDER("aprovado")) phase = "agendado";
  else if (base === "publicado") phase = "agendado";
  return { phase, published, networks: active.length, partial: published > 0 && published < active.length, failed };
}

const DAY_MS = 86_400_000;
const belemMidnight = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "America/Belem", hour12: false }) === "00:00:00";
const deadline = (d: Date) => (belemMidnight(d) ? new Date(d.getTime() + DAY_MS) : d);

export type CycleMetrics = {
  previstos: number; produzidos: number; aprovados: number; publicados: number; pendentes: number; atrasados: number;
  cancelados: number; publicacoes: number; publicacoesFeitas: number; limite: number | null; cumprimento: number;
  porFase: Record<Phase, number>;
};


/** Indicadores de um mês. Cada conteúdo conta uma vez, não importa em quantas redes saia. */
export function cycleMetrics(rows: { post: PostLike; pubs: PubLike[] }[], now = new Date(), limit: number | null = null): CycleMetrics {
  const porFase = Object.fromEntries(PHASES.map((p) => [p, 0])) as Record<Phase, number>;
  let atrasados = 0, publicacoes = 0, publicacoesFeitas = 0;
  for (const { post, pubs } of rows) {
    const st = contentState(post, pubs);
    porFase[st.phase]++;
    if (st.phase === "cancelado") continue;
    publicacoes += st.networks || (post.networks?.length ?? 0);
    publicacoesFeitas += st.networks ? st.published : st.phase === "publicado" ? (post.networks?.length ?? 0) : 0;
    if (st.phase !== "publicado" && post.scheduledAt && deadline(post.scheduledAt) < now) atrasados++;
  }
  const previstos = rows.length - porFase.cancelado;
  const at = (min: Phase) => PHASES.filter((p) => p !== "cancelado" && ORDER(p) >= ORDER(min)).reduce((s, p) => s + porFase[p], 0);
  const publicados = porFase.publicado;
  const meta = limit && limit > 0 ? Math.max(limit, previstos) : previstos;
  return {
    previstos, produzidos: at("aprovacao"), aprovados: at("aprovado"), publicados, pendentes: previstos - publicados, atrasados,
    cancelados: porFase.cancelado, publicacoes, publicacoesFeitas, limite: limit && limit > 0 ? limit : null,
    cumprimento: meta ? Math.round((publicados / meta) * 100) : 0, porFase,
  };
}

// ── banco ──────────────────────────────────────────────────────────────────────
export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(`${month}-01T00:00:00-03:00`), to: new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-03:00`) };
};
export const isMonth = (s: string | null | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

async function monthRows(projectIds: string[], month: string) {
  if (!projectIds.length) return [];
  const { from, to } = monthRange(month);
  const posts = await db()
    .select({ id: socialPosts.id, projectId: socialPosts.projectId, brand: socialPosts.brand, status: socialPosts.status, scheduledAt: socialPosts.scheduledAt, networks: socialPosts.networks, scriptBy: socialPosts.scriptBy, captureBy: socialPosts.captureBy, editor: socialPosts.editor })
    .from(socialPosts)
    .where(and(inArray(socialPosts.projectId, projectIds), isNull(socialPosts.linkedTo), isNull(socialPosts.dismissedAt), gte(socialPosts.scheduledAt, from), lt(socialPosts.scheduledAt, to)))
    .orderBy(asc(socialPosts.scheduledAt));
  const pubs = posts.length ? await db().select({ postId: postPublications.postId, network: postPublications.network, status: postPublications.status }).from(postPublications).where(inArray(postPublications.postId, posts.map((p) => p.id))) : [];
  return posts.map((post) => ({ post, pubs: pubs.filter((p) => p.postId === post.id) }));
}

export type CycleReport = {
  projectId: string; titulo: string; month: string; recurring: boolean; cycle: { status: string; closedAt: Date | null; note: string | null } | null;
  metrics: CycleMetrics; porMarca: { brand: string; metrics: CycleMetrics }[]; responsaveis: { name: string; total: number; pendentes: number }[];
  operacoes: { projectId: string; titulo: string; metrics: CycleMetrics }[];
};

/** Relatório do mês de um projeto. Se ele tem operações (filhos), consolida as operações sem perder a visão de cada uma. */
export async function cycleReport(projectId: string, month: string, now = new Date()): Promise<CycleReport | null> {
  const [p] = await db().select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return null;
  const children = await db().select({ id: projects.id, titulo: projects.titulo, categoria: projects.categoria, postLimit: projects.postLimit }).from(projects).where(eq(projects.parentId, projectId)).orderBy(asc(projects.titulo));
  const rows = await monthRows([p.id, ...children.map((c) => c.id)], month);
  const own = rows.filter((r) => r.post.projectId === p.id);
  const limitOf = (categoria: string, postLimit: number | null) => effectivePostLimit(categoria, postLimit);
  const operacoes = children.map((c) => ({ projectId: c.id, titulo: c.titulo, metrics: cycleMetrics(rows.filter((r) => r.post.projectId === c.id), now, limitOf(c.categoria, c.postLimit)) }));
  const brands = [...new Set(rows.map((r) => r.post.brand).filter((b): b is string => !!b))].sort();
  const people = new Map<string, { total: number; pendentes: number }>();
  for (const r of rows) {
    const done = contentState(r.post, r.pubs).phase;
    for (const n of new Set([r.post.scriptBy, r.post.captureBy, r.post.editor].filter((x): x is string => !!x?.trim()).map((x) => x.trim()))) {
      const cur = people.get(n) ?? { total: 0, pendentes: 0 };
      cur.total++;
      if (done !== "publicado" && done !== "cancelado") cur.pendentes++;
      people.set(n, cur);
    }
  }
  const [cycle] = await db().select().from(projectCycles).where(and(eq(projectCycles.projectId, projectId), eq(projectCycles.month, month))).limit(1);
  const totalLimit = children.length ? children.reduce<number | null>((s, c) => { const l = limitOf(c.categoria, c.postLimit); return l ? (s ?? 0) + l : s; }, null) : limitOf(p.categoria, p.postLimit);
  return {
    projectId, titulo: p.titulo, month, recurring: isRecurring(p),
    cycle: cycle ? { status: cycle.status, closedAt: cycle.closedAt, note: cycle.note } : null,
    metrics: cycleMetrics(children.length ? rows : own, now, totalLimit),
    porMarca: brands.map((brand) => ({ brand, metrics: cycleMetrics(rows.filter((r) => r.post.brand === brand), now) })),
    responsaveis: [...people.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.pendentes - a.pendentes || a.name.localeCompare(b.name)),
    operacoes,
  };
}

export class CycleError extends Error {}

/** Fecha o mês: guarda o retrato dos indicadores. O projeto continua ativo e o próximo mês começa sozinho. */
export async function closeCycle(projectId: string, month: string, userId: string | null, note?: string | null) {
  if (!isMonth(month)) throw new CycleError("Mês inválido.");
  const rep = await cycleReport(projectId, month);
  if (!rep) throw new CycleError("Projeto não encontrado.");
  const values = { projectId, month, status: "fechado", summary: { ...rep.metrics, porMarca: rep.porMarca, operacoes: rep.operacoes }, note: note?.trim().slice(0, 1000) || null, closedAt: new Date(), closedBy: userId };
  const [row] = await db().insert(projectCycles).values(values).onConflictDoUpdate({ target: [projectCycles.projectId, projectCycles.month], set: { status: values.status, summary: values.summary, note: values.note, closedAt: values.closedAt, closedBy: values.closedBy } }).returning();
  return row;
}

/** Reabre o mês (o retrato antigo fica guardado até o próximo fechamento). */
export async function reopenCycle(projectId: string, month: string) {
  const [row] = await db().update(projectCycles).set({ status: "aberto" }).where(and(eq(projectCycles.projectId, projectId), eq(projectCycles.month, month))).returning();
  return row ?? null;
}

export async function listCycles(projectId: string) {
  return db().select().from(projectCycles).where(eq(projectCycles.projectId, projectId)).orderBy(asc(projectCycles.month));
}

// ── publicações por rede ───────────────────────────────────────────────────────
export const NETWORKS = ["instagram", "facebook", "tiktok", "youtube", "linkedin", "threads", "pinterest", "google"] as const;
export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", google: "Google" };

export async function listPublications(postIds: string[]) {
  if (!postIds.length) return [];
  return db().select().from(postPublications).where(inArray(postPublications.postId, postIds)).orderBy(asc(postPublications.network));
}

/**
 * Ajusta as redes de um conteúdo: cria a publicação das redes novas e cancela (sem apagar) as removidas.
 * Publicação já feita nunca é cancelada nem apagada.
 */
export async function syncPublications(postId: string, networks: string[]) {
  const wanted = [...new Set(networks.map((n) => n.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  const current = await db().select().from(postPublications).where(eq(postPublications.postId, postId));
  const have = new Set(current.map((c) => c.network));
  const fresh = wanted.filter((n) => !have.has(n));
  if (fresh.length) await db().insert(postPublications).values(fresh.map((network) => ({ postId, network }))).onConflictDoNothing();
  const revive = current.filter((c) => wanted.includes(c.network) && c.status === "cancelado").map((c) => c.id);
  if (revive.length) await db().update(postPublications).set({ status: "pendente", updatedAt: new Date() }).where(inArray(postPublications.id, revive));
  const drop = current.filter((c) => !wanted.includes(c.network) && c.status !== "publicado" && c.status !== "cancelado").map((c) => c.id);
  if (drop.length) await db().update(postPublications).set({ status: "cancelado", updatedAt: new Date() }).where(inArray(postPublications.id, drop));
  await db().update(socialPosts).set({ networks: wanted, updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  return db().select().from(postPublications).where(eq(postPublications.postId, postId)).orderBy(asc(postPublications.network));
}

export type PubPatch = { status?: PubStatus; url?: string | null; scheduledAt?: Date | null; error?: string | null };

/** Atualiza a publicação de uma rede. Quando todas as redes ativas saem, o post vira "postado". */
export async function updatePublication(postId: string, network: string, patch: PubPatch) {
  if (patch.status && !(PUB_STATUS as readonly string[]).includes(patch.status)) throw new CycleError("Status de publicação inválido.");
  if (patch.url && !/^https:\/\//i.test(patch.url)) throw new CycleError("O link da publicação precisa começar com https://.");
  const set: Partial<typeof postPublications.$inferInsert> = { ...patch, updatedAt: new Date() };
  if (patch.status === "publicado") set.publishedAt = new Date();
  if (patch.status && patch.status !== "erro") set.error = patch.error ?? null;
  const [row] = await db().update(postPublications).set(set).where(and(eq(postPublications.postId, postId), eq(postPublications.network, network))).returning();
  if (!row) throw new CycleError("Essa rede não está neste conteúdo.");
  const [post] = await db().select({ status: socialPosts.status, scheduledAt: socialPosts.scheduledAt }).from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  const pubs = await db().select({ network: postPublications.network, status: postPublications.status }).from(postPublications).where(eq(postPublications.postId, postId));
  const st = contentState(post, pubs);
  if (st.phase === "publicado" && post.status !== "postado") await db().update(socialPosts).set({ status: "postado", updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  else if (st.phase !== "publicado" && post.status === "postado") await db().update(socialPosts).set({ status: "agendado", updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  return { publication: row, state: st };
}

/** Recorrente = marcado no projeto ou plano de redes sociais (que é mensal por natureza). Sem migrar dados. */
export const isRecurring = (p: { recurring?: boolean | null; categoria?: string | null }) => !!p.recurring || p.categoria === "social";

/** Projetos recorrentes não ficam "atrasados" por prazo: o que atrasa é o conteúdo do mês. */
export function projectLate(p: { recurring?: boolean | null; categoria?: string | null; prazo: Date | string | null; status: string }, now = new Date()) {
  if (isRecurring(p) || !p.prazo || p.status === "entregue") return false;
  return new Date(p.prazo).getTime() < now.getTime();
}

