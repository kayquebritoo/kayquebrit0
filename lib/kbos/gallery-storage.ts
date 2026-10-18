// Arquivos da galeria no disco da VPS (volume Docker). Só ids (uuid) viram caminho — nunca texto do usuário.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PHOTO_KINDS = ["thumb", "preview", "download"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const root = () => process.env.GALLERY_DIR || "/data/gallery";
function dir(albumId: string, photoId: string) {
  if (!UUID.test(albumId) || !UUID.test(photoId)) throw new Error("id inválido");
  return join(root(), albumId, photoId);
}

export async function savePhotoFile(albumId: string, photoId: string, kind: PhotoKind, bytes: Buffer) {
  const d = dir(albumId, photoId);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, `${kind}.jpg`), bytes);
}
export async function readPhotoFile(albumId: string, photoId: string, kind: PhotoKind) {
  return readFile(join(dir(albumId, photoId), `${kind}.jpg`));
}
export async function removePhotoFiles(albumId: string, photoId: string) {
  await rm(dir(albumId, photoId), { recursive: true, force: true });
}
/** JPEG de verdade (começa com FFD8FF) e dentro do limite. */
export const looksLikeJpeg = (b: Buffer) => b.length > 1024 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
export const MAX_PHOTO_BYTES = { thumb: 300_000, preview: 2_500_000, download: 8_000_000 } as const;
