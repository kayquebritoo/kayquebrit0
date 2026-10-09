// Helpers LMS seguros p/ client components (SEM imports node-only).
// (lms.ts tem crypto/db/fila — nunca importe ele no browser.)

export function slugify(titulo: string) {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Extrai o ID de URLs do YouTube (watch/embed/shorts/youtu.be) ou null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return m?.[1] ?? null;
}
