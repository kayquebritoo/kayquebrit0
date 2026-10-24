import { cleanTitle, type ParsedPost } from "./social-import";

export const normalizeContent = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const contentDay = (date: Date | null) => date?.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }) ?? "";

export type ContentIdentity = {
  id: string;
  projectId: string | null;
  externalKey: string | null;
  brand: string | null;
  title: string;
  format: string;
  scheduledAt: Date | null;
  caption: string | null;
};

/** Empresa desconhecida nunca é um coringa para outra empresa. */
export function sameContentBrand(a: string | null, b: string | null) {
  return normalizeContent(a ?? "") === normalizeContent(b ?? "");
}

export function titleIdentity(post: Pick<ContentIdentity, "brand" | "title" | "format" | "scheduledAt">) {
  return JSON.stringify([post.brand ? normalizeContent(post.brand) : null, contentDay(post.scheduledAt), normalizeContent(cleanTitle(post.title)), post.format]);
}

/** Compatibilidade sem trocar chaves, editar posts ou reativar itens ocultos. */
export function matchesImportedPost(post: ParsedPost, row: ContentIdentity, sharedLegacyKey = false) {
  if (row.externalKey === post.key) return true;
  if (row.externalKey === post.legacyKey && (!sharedLegacyKey || !post.brand || !row.brand || sameContentBrand(post.brand, row.brand))) return true;
  if (!sameContentBrand(post.brand, row.brand) || contentDay(post.scheduledAt) !== contentDay(row.scheduledAt)) return false;
  if (titleIdentity(post) === titleIdentity(row)) return true;
  // A mLabs pode usar "outro" e um título abreviado para o mesmo post ICS.
  return !!post.caption && !!row.caption && normalizeContent(post.caption) === normalizeContent(row.caption);
}

const captionIdentity = (post: Pick<ContentIdentity, "brand" | "scheduledAt" | "caption">) => JSON.stringify([normalizeContent(post.brand ?? ""), contentDay(post.scheduledAt), normalizeContent(post.caption ?? "")]);

/** Indexa uma vez: calendários grandes não repetem a conversão de fuso para cada par. */
export function indexImportedPosts(rows: ContentIdentity[]) {
  const external = new Map(rows.filter(row => row.externalKey).map(row => [row.externalKey!, row]));
  const titles = new Set(rows.map(titleIdentity));
  const captions = new Set(rows.filter(row => row.caption?.trim()).map(captionIdentity));
  return (post: ParsedPost, sharedLegacyKey: boolean) => {
    const exact = external.get(post.key);
    if (exact) return true;
    const legacy = external.get(post.legacyKey);
    if (legacy && matchesImportedPost(post, legacy, sharedLegacyKey)) return true;
    return titles.has(titleIdentity(post)) || (!!post.caption?.trim() && captions.has(captionIdentity(post)));
  };
}

export function matchingPublication<T extends ContentIdentity>(rows: T[], incoming: { externalKey: string; brand: string | null; caption: string; scheduledAt: Date }): { match: T | undefined; ambiguous: boolean } {
  const exact = rows.find(row => row.externalKey === incoming.externalKey);
  if (exact) return { match: exact, ambiguous: false };
  const candidates = rows.filter(row => sameContentBrand(row.brand, incoming.brand) && contentDay(row.scheduledAt) === contentDay(incoming.scheduledAt) && !!row.caption && normalizeContent(row.caption) === normalizeContent(incoming.caption));
  return { match: candidates.length === 1 ? candidates[0] : undefined, ambiguous: candidates.length > 1 };
}

export function publicationUpdateAllowed(current: string, incoming: string) {
  if (current === incoming || current === "postado") return false;
  if (incoming === "postado" || incoming === "erro") return true;
  return incoming === "agendado" && current !== "erro";
}
