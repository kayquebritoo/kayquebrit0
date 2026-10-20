// Galeria do cliente com SQL real (PGlite) e arquivos num diretório temporário.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
process.env.GALLERY_DIR = mkdtempSync(join(tmpdir(), "galeria-"));
import { addPhoto, authorizePhotos, createAlbum, listAlbums, listGuests, readAlbum, readPhoto, revokePhotos, setAlbumStatus } from "../gallery";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
}, 30_000);
beforeEach(async () => { await pg.exec("TRUNCATE kbos_albums CASCADE"); });
afterAll(async () => { await pg.close(); });

const jpeg = (n = 2000) => { const b = Buffer.alloc(n, 1); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
const photo = (name = "a.jpg") => ({ name, thumb: jpeg(), preview: jpeg(), download: jpeg() });
async function seed(publish = true) {
  const { id, token } = await createAlbum({ title: "Lounge sexta", brand: "Atalaia Vip" });
  const p1 = await addPhoto(id, photo("a.jpg"));
  const p2 = await addPhoto(id, photo("b.jpg"));
  if (publish) await setAlbumStatus(id, "published");
  return { id, token, p1, p2 };
}
const selfie = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const me = { name: "Maria Souza", phone: "(91) 98888-0000", ip: "1.2.3.4", userAgent: "t", selfie };

describe("galeria do cliente", () => {
  it("só abre depois de publicada e com o token certo", async () => {
    const { token } = await seed(false);
    await expect(readAlbum(token)).rejects.toThrow(/não encontrado/i);
    await setAlbumStatus((await listAlbums())[0].id as string, "published");
    expect((await readAlbum(token)).photos).toHaveLength(2);
    await expect(readAlbum("0".repeat(64))).rejects.toThrow(/não encontrado/i);
    await expect(readAlbum("lixo")).rejects.toThrow(/não encontrado/i);
  });

  it("recusa arquivo que não é JPEG", async () => {
    const { id } = await createAlbum({ title: "X álbum" });
    await expect(addPhoto(id, { ...photo(), thumb: Buffer.alloc(2000, 7) })).rejects.toThrow(/JPEG/);
  });

  it("download só depois de autorizar, com o WhatsApp certo, e conta o download", async () => {
    const { token, p1, p2 } = await seed();
    await expect(readPhoto(token, p1, "download", me.phone)).rejects.toThrow(/Autorize/);
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    expect((await readPhoto(token, p1, "download", "91988880000")).bytes.length).toBe(2000);
    await expect(readPhoto(token, p2, "download", me.phone)).rejects.toThrow(/Autorize/);
    await expect(readPhoto(token, p1, "download", "(91) 97777-0000")).rejects.toThrow(/Autorize/);
    expect((await listAlbums())[0].downloads).toBe(1);
    expect((await listAlbums())[0].authorized).toBe(1);
  });

  it("miniatura e prévia abrem sem autorização", async () => {
    const { token, p1 } = await seed();
    expect((await readPhoto(token, p1, "thumb")).bytes.length).toBe(2000);
    expect((await readPhoto(token, p1, "preview")).bytes.length).toBe(2000);
  });

  it("autorizar duas vezes a mesma foto não duplica; guarda consentimento, nome e versão", async () => {
    const { token, p1 } = await seed();
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    const rows = await d.select().from(schema.albumAuthorizations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ signerName: "Maria Souza", signerPhone: "91988880000", consentVersion: "galeria-v2" });
    expect(rows[0].ipHash).not.toContain("1.2.3.4");
  });

  it("valida nome, telefone, fotos e pertencimento ao álbum", async () => {
    const a = await seed();
    const b = await seed();
    await expect(authorizePhotos(a.token, { ...me, name: "Jo", photoIds: [a.p1] })).rejects.toThrow(/nome/i);
    await expect(authorizePhotos(a.token, { ...me, phone: "123", photoIds: [a.p1] })).rejects.toThrow(/WhatsApp/);
    await expect(authorizePhotos(a.token, { ...me, photoIds: [] })).rejects.toThrow(/ao menos/);
    await expect(authorizePhotos(a.token, { ...me, photoIds: [b.p1] })).rejects.toThrow(/não pertence/);
  });

  it("retirar a autorização bloqueia o download e some de 'minhas fotos'", async () => {
    const { token, p1 } = await seed();
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    expect((await readAlbum(token, me.phone)).authorized).toEqual([p1]);
    expect((await revokePhotos(token, me.phone)).revoked).toBe(1);
    expect((await readAlbum(token, me.phone)).authorized).toEqual([]);
    await expect(readPhoto(token, p1, "download", me.phone)).rejects.toThrow(/Autorize/);
  });

  it("1ª autorização exige selfie; a pessoa fica cadastrada e a 2ª não pede de novo", async () => {
    const { id, token, p1, p2 } = await seed();
    await expect(authorizePhotos(token, { ...me, selfie: undefined, photoIds: [p1] })).rejects.toThrow(/selfie/i);
    await expect(authorizePhotos(token, { ...me, selfie: "data:text/html;base64,AAAA", photoIds: [p1] })).rejects.toThrow(/selfie/i);
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    await authorizePhotos(token, { ...me, selfie: undefined, photoIds: [p2] });
    const g = await listGuests(id);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ name: "Maria Souza", phone: "91988880000", isMinor: false, consentVersion: "galeria-v2" });
    expect((await readAlbum(token, me.phone)).guest).toBe(true);
  });

  it("menor de idade exige o responsável", async () => {
    const { id, token, p1 } = await seed();
    await expect(authorizePhotos(token, { ...me, minor: true, photoIds: [p1] })).rejects.toThrow(/responsável/);
    await authorizePhotos(token, { ...me, minor: true, guardianName: "Ana Souza", photoIds: [p1] });
    expect((await listGuests(id))[0]).toMatchObject({ isMinor: true, guardianName: "Ana Souza" });
  });

  it("retirar tudo também marca a pessoa como retirada", async () => {
    const { id, token, p1 } = await seed();
    await authorizePhotos(token, { ...me, photoIds: [p1] });
    await revokePhotos(token, me.phone);
    expect((await listGuests(id))[0].revokedAt).not.toBeNull();
  });

  it("álbum expirado não abre", async () => {
    const { token, id } = await seed();
    await pg.query(`UPDATE kbos_albums SET expires_at = now() - interval '1 day' WHERE id = $1`, [id]);
    await expect(readAlbum(token)).rejects.toThrow(/expirou/);
  });
});
