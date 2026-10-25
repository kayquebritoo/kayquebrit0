// Regras puras do conteúdo (sem banco): usadas no servidor e nas telas.
// Regra de ouro: a ENTREGA é o conteúdo produzido (1 Reels = 1 entrega), não cada rede em que ele sai.

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

export const NETWORKS = ["instagram", "facebook", "tiktok", "youtube", "linkedin", "threads", "pinterest", "google"] as const;
export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", google: "Google" };

/** Recorrente = marcado no projeto ou plano de redes sociais (que é mensal por natureza). Sem migrar dados. */
export const isRecurring = (p: { recurring?: boolean | null; categoria?: string | null }) => !!p.recurring || p.categoria === "social";

/** Projetos recorrentes não ficam "atrasados" por prazo: o que atrasa é o conteúdo do mês. */
export function projectLate(p: { recurring?: boolean | null; categoria?: string | null; prazo: Date | string | null; status: string }, now = new Date()) {
  if (isRecurring(p) || !p.prazo || p.status === "entregue") return false;
  return new Date(p.prazo).getTime() < now.getTime();
}

