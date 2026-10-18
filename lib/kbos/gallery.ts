// Galeria do cliente: álbum com link privado → cliente escolhe as fotos dele, autoriza o uso nas redes e baixa.
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { albumAuthorizations, albumPhotos, albums } from "./schema";
import { PublicError } from "./http";
import { looksLikeJpeg, MAX_PHOTO_BYTES, readPhotoFile, removePhotoFiles, savePhotoFile, type PhotoKind } from "./gallery-storage";

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
export const validToken = (t: string) => /^[a-f0-9]{64}$/.test(t);
export const CONSENT_VERSION = "galeria-v1";
export const CONSENT_TEXT =
  "Autorizo o uso gratuito das fotos selecionadas, nas quais apareço, nas redes sociais e canais de divulgação do grupo Atalaia Vip e de Kayque Brito (fotógrafo). Entendo que posso retirar esta autorização quando quiser, pelo mesmo link ou pelo WhatsApp, e que as fotos baixadas por mim têm a logomarca do hotel.";

const ipHash = (ip: string) => createHash("sha256").update(`galeria:${ip}`).digest("hex").slice(0, 32);
const cleanPhone = (v: string) => v.replace(/\D/g, "");

export async function createAlbum(input: { title: string; brand?: string; eventDate?: string | null; expiresAt?: Date | null; contactId?: string | null }) {
  const title = input.title.trim();
  if (title.length < 2) throw new PublicError("Dê um título ao álbum.");
  const token = randomBytes(32).toString("hex");
  const [a] = await db().insert(albums).values({
    tokenHash: tokenHash(token), title: title.slice(0, 120), brand: (input.brand ?? "").trim().slice(0, 80),
    eventDate: input.eventDate ?? null, expiresAt: input.expiresAt ?? null, contactId: input.contactId ?? null,
  }).returning();
  return { id: a.id, token }; // o token só existe agora: guarda o link, o banco tem só o hash
}

export async function listAlbums() {
  const rows = await db().execute(sql`
    SELECT a.id, a.title, a.brand, a.event_date AS "eventDate", a.status, a.expires_at AS "expiresAt", a.created_at AS "createdAt",
      (SELECT count(*)::int FROM kbos_album_photos p WHERE p.album_id = a.id) AS photos,
      (SELECT count(DISTINCT x.photo_id)::int FROM kbos_album_authorizations x WHERE x.album_id = a.id AND x.revoked_at IS NULL) AS authorized,
      (SELECT COALESCE(sum(p.downloads),0)::int FROM kbos_album_photos p WHERE p.album_id = a.id) AS downloads
    FROM kbos_albums a ORDER BY a.created_at DESC`);
  return rows.rows as Record<string, unknown>[];
}

export async function setAlbumStatus(id: string, status: "draft" | "published" | "closed") {
  await db().update(albums).set({ status }).where(eq(albums.id, id));
}

/** Foto nova no álbum (já com marca d'água, gerada pela ferramenta de envio). */
export async function addPhoto(albumId: string, f: { name: string; width?: number; height?: number; takenAt?: Date | null; thumb: Buffer; preview: Buffer; download: Buffer }) {
  const [a] = await db().select({ id: albums.id }).from(albums).where(eq(albums.id, albumId)).limit(1);
  if (!a) throw new PublicError("Álbum não encontrado.", 404);
  for (const k of ["thumb", "preview", "download"] as const) {
    if (!looksLikeJpeg(f[k])) throw new PublicError(`A versão ${k} precisa ser JPEG.`);
    if (f[k].length > MAX_PHOTO_BYTES[k]) throw new PublicError(`A versão ${k} passou do limite de tamanho.`, 413);
  }
  const [p] = await db().insert(albumPhotos).values({
    albumId, name: f.name.replace(/[^\w.\- ]/g, "").slice(0, 120) || "foto.jpg", width: f.width ?? null, height: f.height ?? null, takenAt: f.takenAt ?? null,
  }).returning();
  try {
    for (const k of ["thumb", "preview", "download"] as const) await savePhotoFile(albumId, p.id, k, f[k]);
  } catch (e) {
    await db().delete(albumPhotos).where(eq(albumPhotos.id, p.id));
    await removePhotoFiles(albumId, p.id).catch(() => undefined);
    throw e;
  }
  return p.id;
}

export async function removePhoto(albumId: string, photoId: string) {
  await db().delete(albumPhotos).where(and(eq(albumPhotos.id, photoId), eq(albumPhotos.albumId, albumId)));
  await removePhotoFiles(albumId, photoId).catch(() => undefined);
}

async function openAlbum(token: string) {
  if (!validToken(token)) throw new PublicError("Link não encontrado.", 404);
  const [a] = await db().select().from(albums).where(eq(albums.tokenHash, tokenHash(token))).limit(1);
  if (!a || a.status !== "published") throw new PublicError("Link não encontrado.", 404);
  if (a.expiresAt && a.expiresAt.getTime() < Date.now()) throw new PublicError("Esta galeria expirou. Fale com o Kayque pelo WhatsApp.", 410);
  return a;
}

/** O que o cliente vê: fotos e o que ele já autorizou (por telefone informado na sessão, se houver). */
export async function readAlbum(token: string, phone?: string) {
  const a = await openAlbum(token);
  const photos = await db().select({ id: albumPhotos.id, width: albumPhotos.width, height: albumPhotos.height }).from(albumPhotos).where(eq(albumPhotos.albumId, a.id)).orderBy(asc(albumPhotos.takenAt), asc(albumPhotos.createdAt));
  let mine: string[] = [];
  const digits = phone ? cleanPhone(phone) : "";
  if (digits.length >= 10) {
    const rows = await db().select({ photoId: albumAuthorizations.photoId }).from(albumAuthorizations)
      .where(and(eq(albumAuthorizations.albumId, a.id), eq(albumAuthorizations.signerPhone, digits), isNull(albumAuthorizations.revokedAt)));
    mine = rows.map((r) => r.photoId);
  }
  return { title: a.title, brand: a.brand, eventDate: a.eventDate, consentText: CONSENT_TEXT, photos, authorized: mine };
}

export async function authorizePhotos(token: string, input: { name: string; phone: string; photoIds: string[]; ip: string; userAgent: string }) {
  const a = await openAlbum(token);
  const name = input.name.trim().replace(/\s+/g, " ");
  const phone = cleanPhone(input.phone);
  if (name.length < 3) throw new PublicError("Informe seu nome completo.");
  if (phone.length < 10 || phone.length > 13) throw new PublicError("Informe seu WhatsApp com DDD.");
  const ids = [...new Set(input.photoIds)].slice(0, 200);
  if (!ids.length) throw new PublicError("Escolha ao menos uma foto.");
  const valid = await db().select({ id: albumPhotos.id }).from(albumPhotos).where(and(eq(albumPhotos.albumId, a.id), inArray(albumPhotos.id, ids)));
  if (valid.length !== ids.length) throw new PublicError("Alguma foto não pertence a esta galeria.");
  const already = await db().select({ photoId: albumAuthorizations.photoId }).from(albumAuthorizations)
    .where(and(eq(albumAuthorizations.albumId, a.id), eq(albumAuthorizations.signerPhone, phone), isNull(albumAuthorizations.revokedAt), inArray(albumAuthorizations.photoId, ids)));
  const done = new Set(already.map((r) => r.photoId));
  const fresh = ids.filter((i) => !done.has(i));
  if (fresh.length) {
    await db().insert(albumAuthorizations).values(fresh.map((photoId) => ({
      albumId: a.id, photoId, signerName: name.slice(0, 120), signerPhone: phone, consentVersion: CONSENT_VERSION,
      ipHash: ipHash(input.ip), userAgent: input.userAgent.slice(0, 300),
    })));
  }
  return { authorized: ids.length };
}

export async function revokePhotos(token: string, phone: string, photoIds?: string[]) {
  const a = await openAlbum(token);
  const digits = cleanPhone(phone);
  if (digits.length < 10) throw new PublicError("Informe o WhatsApp usado na autorização.");
  const conds = [eq(albumAuthorizations.albumId, a.id), eq(albumAuthorizations.signerPhone, digits), isNull(albumAuthorizations.revokedAt)];
  if (photoIds?.length) conds.push(inArray(albumAuthorizations.photoId, photoIds));
  const res = await db().update(albumAuthorizations).set({ revokedAt: new Date() }).where(and(...conds)).returning({ id: albumAuthorizations.id });
  return { revoked: res.length };
}

/** Miniatura e prévia são livres para quem tem o link; o arquivo de download só sai depois da autorização do telefone informado. */
export async function readPhoto(token: string, photoId: string, kind: PhotoKind, phone?: string) {
  const a = await openAlbum(token);
  const [p] = await db().select({ id: albumPhotos.id, name: albumPhotos.name }).from(albumPhotos).where(and(eq(albumPhotos.id, photoId), eq(albumPhotos.albumId, a.id))).limit(1);
  if (!p) throw new PublicError("Foto não encontrada.", 404);
  if (kind === "download") {
    const digits = cleanPhone(phone ?? "");
    const [ok] = digits.length >= 10
      ? await db().select({ id: albumAuthorizations.id }).from(albumAuthorizations).where(and(eq(albumAuthorizations.photoId, photoId), eq(albumAuthorizations.signerPhone, digits), isNull(albumAuthorizations.revokedAt))).limit(1)
      : [];
    if (!ok) throw new PublicError("Autorize o uso da foto para baixar.", 403);
    await db().update(albumPhotos).set({ downloads: sql`${albumPhotos.downloads} + 1` }).where(eq(albumPhotos.id, photoId));
  }
  const bytes = await readPhotoFile(a.id, photoId, kind).catch(() => null);
  if (!bytes) throw new PublicError("Arquivo indisponível.", 404);
  return { bytes, name: p.name };
}
