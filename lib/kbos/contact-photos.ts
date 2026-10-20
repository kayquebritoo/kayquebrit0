import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts } from "@/lib/kbos/schema";
import { fetchWhatsappProfilePicture } from "@/lib/kbos/evolution";
import { canonPhone } from "@/lib/kbos/contact-import";

// Hosts de foto que o avatar aceita servir (evita usar o servidor para buscar qualquer endereço).
const PHOTO_HOSTS = [/(^|\.)whatsapp\.net$/, /(^|\.)googleusercontent\.com$/, /(^|\.)fbcdn\.net$/, /(^|\.)cdninstagram\.com$/, /(^|\.)gravatar\.com$/];
export const photoHostOk = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && PHOTO_HOSTS.some((r) => r.test(x.hostname)); } catch { return false; } };

/** Busca a foto de perfil do WhatsApp para quem ainda não tem foto (clientes primeiro). Devolve quantos achou e quantos faltam. */
export async function fillWhatsappPhotos(limit = 60): Promise<{ checked: number; found: number; remaining: number; tried: string[] }> {
  const missing = and(isNull(contacts.photoUrl), isNotNull(contacts.phone), ne(contacts.status, "archived"), sql`coalesce(${contacts.externalIds}->>'waPhotoTried', '') = ''`);
  const rows = await db()
    .select({ id: contacts.id, phone: contacts.phone, externalIds: contacts.externalIds })
    .from(contacts)
    .where(missing)
    .orderBy(sql`(${contacts.status} = 'client') desc`, desc(contacts.updatedAt))
    .limit(limit);
  let found = 0;
  const tried: string[] = [];
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(async (r) => {
      const n = canonPhone(r.phone);
      const url = n ? await fetchWhatsappProfilePicture(n) : null;
      const ext = { ...((r.externalIds as Record<string, string> | null) ?? {}), waPhotoTried: new Date().toISOString().slice(0, 10) };
      if (url) found++;
      tried.push(r.id);
      await db().update(contacts).set(url ? { photoUrl: url, externalIds: ext } : { externalIds: ext }).where(eq(contacts.id, r.id));
    }));
  }
  const left = await db().select({ n: sql<number>`count(*)::int` }).from(contacts).where(missing);
  return { checked: rows.length, found, remaining: left[0]?.n ?? 0, tried };
}

/** Atualiza a foto de UM contato direto do WhatsApp (usado quando o link guardado expirou). */
export async function refreshOnePhoto(id: string): Promise<string | null> {
  const [c] = await db().select({ phone: contacts.phone }).from(contacts).where(eq(contacts.id, id)).limit(1);
  const n = canonPhone(c?.phone);
  const url = n ? await fetchWhatsappProfilePicture(n) : null;
  if (url) await db().update(contacts).set({ photoUrl: url }).where(eq(contacts.id, id));
  return url;
}
