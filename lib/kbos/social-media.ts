// Arquivos finais dos posts no volume da VPS (o mesmo da galeria). Upload em pedaços de até 8 MB
// (o proxy aceita 12 MB por requisição), então vídeo grande também passa. Só ids viram caminho.
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, max } from "drizzle-orm";
import { db } from "./db";
import { postMedia } from "./schema";
import { appUrlEnv } from "./email";

export const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB (Reels aceita até 1 GB)
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB (limite do Instagram)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = () => join(process.env.GALLERY_DIR || "/data/gallery", "social");

export class MediaError extends Error {}

/** Formato pela extensão + assinatura do conteúdo. O Instagram só aceita JPEG em imagem. */
export function mediaKind(name: string, head: Buffer): { kind: "image" | "video"; mime: string } {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const hex = head.subarray(0, 4).toString("hex");
  if ((ext === "jpg" || ext === "jpeg") && hex.startsWith("ffd8ff")) return { kind: "image", mime: "image/jpeg" };
  if ((ext === "mp4" || ext === "mov" || ext === "m4v") && head.subarray(4, 8).toString("ascii") === "ftyp") return { kind: "video", mime: ext === "mov" ? "video/quicktime" : "video/mp4" };
  if (ext === "png" || ext === "webp" || ext === "heic") throw new MediaError("O Instagram só publica imagem em JPG. Exporte em JPG e envie de novo.");
  throw new MediaError("Envie JPG (imagem) ou MP4/MOV (vídeo).");
}

export const mediaPath = (postId: string, mediaId: string) => {
  if (!UUID.test(postId) || !UUID.test(mediaId)) throw new MediaError("id inválido");
  return join(root(), postId, mediaId);
};

/** Começa um arquivo: grava o 1º pedaço e devolve o id para os próximos. */
export async function startMedia(postId: string, name: string, expectedSize: number, first: Buffer) {
  const { kind, mime } = mediaKind(name, first);
  const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (expectedSize <= 0 || expectedSize > limit) throw new MediaError(kind === "video" ? "Vídeo de até 1 GB." : "Imagem de até 8 MB.");
  if (first.length > CHUNK_BYTES) throw new MediaError("Pedaço grande demais.");
  const [{ last }] = await db().select({ last: max(postMedia.position) }).from(postMedia).where(eq(postMedia.postId, postId));
  const [row] = await db().insert(postMedia).values({
    postId, position: (last ?? -1) + 1, kind, mime, name: name.replace(/[\x00-\x1f\x7f/\\]/g, "").slice(0, 200), expectedSize,
    publicToken: randomBytes(24).toString("base64url"), status: "enviando",
  }).returning();
  const file = mediaPath(postId, row.id);
  await mkdir(join(root(), postId), { recursive: true });
  await rm(file, { force: true });
  return appendMedia(postId, row.id, 0, first);
}

/** Próximo pedaço, no lugar exato (`offset` = bytes já gravados), para não corromper se o navegador repetir. */
export async function appendMedia(postId: string, mediaId: string, offset: number, chunk: Buffer) {
  const [row] = await db().select().from(postMedia).where(and(eq(postMedia.id, mediaId), eq(postMedia.postId, postId))).limit(1);
  if (!row) throw new MediaError("Arquivo não encontrado.");
  if (row.status !== "enviando") throw new MediaError("Esse arquivo já foi concluído.");
  if (chunk.length > CHUNK_BYTES) throw new MediaError("Pedaço grande demais.");
  const file = mediaPath(postId, mediaId);
  const have = await stat(file).then((s) => s.size).catch(() => 0);
  if (offset !== have) return { id: mediaId, size: have, done: false, resumeAt: have };
  if (have + chunk.length > row.expectedSize) throw new MediaError("O arquivo passou do tamanho informado.");
  await appendFile(file, chunk);
  const size = have + chunk.length;
  const done = size === row.expectedSize;
  await db().update(postMedia).set({ size, ...(done ? { status: "pronto" } : {}) }).where(eq(postMedia.id, mediaId));
  return { id: mediaId, size, done, resumeAt: size };
}

export async function listMedia(postId: string) {
  return db().select().from(postMedia).where(eq(postMedia.postId, postId)).orderBy(asc(postMedia.position));
}

export async function removeMedia(postId: string, mediaId: string) {
  await db().delete(postMedia).where(and(eq(postMedia.id, mediaId), eq(postMedia.postId, postId)));
  await rm(mediaPath(postId, mediaId), { force: true });
}

/** Nova ordem (carrossel). */
export async function reorderMedia(postId: string, ids: string[]) {
  for (const [i, id] of ids.entries()) await db().update(postMedia).set({ position: i }).where(and(eq(postMedia.id, id), eq(postMedia.postId, postId)));
}

export const publicMediaUrl = (token: string, name: string) => {
  const base = appUrlEnv();
  const ext = name.split(".").pop()?.toLowerCase() || "bin";
  return `${base}/api/public/social-media/${token}/arquivo.${ext}`;
};

/** Leitura pelo link público (a Meta baixa daqui). Suporta Range para vídeo. */
export async function openPublicMedia(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db().select().from(postMedia).where(and(eq(postMedia.publicToken, token), eq(postMedia.status, "pronto"))).limit(1);
  if (!row) return null;
  const file = mediaPath(row.postId, row.id);
  const fh = await open(file, "r").catch(() => null);
  if (!fh) return null;
  return { row, fh, size: (await fh.stat()).size };
}
