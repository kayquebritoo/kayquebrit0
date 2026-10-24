import { contentDay, normalizeContent, titleIdentity, type ContentIdentity } from "./social-identity";

type ReviewPost = ContentIdentity & {
  status: string;
  linkedTo: string | null;
  dismissedAt: Date | null;
};

export type ReconciliationReport = ReturnType<typeof reviewContent>;

/** Diagnóstico puro: candidatos não são mesclados, ocultados nem somados como únicos. */
export function reviewContent(rows: ReviewPost[]) {
  const visible = rows.filter(row => !row.linkedTo && !row.dismissedAt);
  const parent = visible.map((_, i) => i);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const keys = new Map<string, number>();
  visible.forEach((post, index) => {
    // Falta de empresa ou data não sustenta agrupamento entre empresas.
    if (!post.projectId || !post.brand || !post.scheduledAt) return;
    const candidates = [`title:${JSON.stringify([post.projectId, titleIdentity(post)])}`];
    if (post.caption?.trim()) candidates.push(`caption:${JSON.stringify([post.projectId, normalizeContent(post.brand), contentDay(post.scheduledAt), normalizeContent(post.caption)])}`);
    for (const key of candidates) {
      const previous = keys.get(key);
      if (previous !== undefined) parent[root(index)] = root(previous);
      else keys.set(key, index);
    }
  });
  const grouped = new Map<number, ReviewPost[]>();
  visible.forEach((post, index) => {
    const key = root(index);
    grouped.set(key, [...(grouped.get(key) ?? []), post]);
  });
  const groups = [...grouped.values()].filter(group => group.length > 1).map(group => ({
    brand: group[0].brand!,
    day: contentDay(group[0].scheduledAt),
    title: group[0].title,
    differences: [
      new Set(group.map(post => post.status)).size > 1 ? "Etapas diferentes" : null,
      new Set(group.map(post => post.scheduledAt?.toISOString())).size > 1 ? "Horários diferentes" : null,
      new Set(group.map(post => post.format)).size > 1 ? "Formatos diferentes" : null,
      new Set(group.map(post => post.caption?.trim() ?? "")).size > 1 ? "Legendas diferentes" : null,
    ].filter((value): value is string => value !== null),
    items: group.map(post => ({ id: post.id, title: post.title, status: post.status, scheduledAt: post.scheduledAt?.toISOString() ?? null, source: post.externalKey?.startsWith("mlabs:") ? "mLabs" : post.externalKey?.startsWith("ics2:") || /^[a-f0-9]{32}$/.test(post.externalKey ?? "") ? "ICS" : "Cadastro" })),
  }));
  return {
    records: visible.length,
    hidden: rows.length - visible.length,
    unidentified: visible.filter(post => !post.brand).length,
    undated: visible.filter(post => !post.scheduledAt).length,
    candidateRecords: groups.reduce((sum, group) => sum + group.items.length, 0),
    groups,
  };
}
