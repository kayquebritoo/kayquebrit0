// Arquivar em lote (nunca apaga): só leads, e o chamador escolhe quais.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { contacts } from "./schema";
import { looksLikeNumber } from "./contact-import";

/** Nome vazio, só número ou "Sem nome" → lead sem identificação. */
export const isNameless = (name: string | null | undefined) => !name || looksLikeNumber(name) || /^sem nome$/i.test(name.trim());

/** Arquiva (status "archived") apenas leads da lista; clientes e outros status ficam intactos. */
export async function archiveLeads(ids: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300);
    const rows = await db().update(contacts).set({ status: "archived", updatedAt: new Date() }).where(and(inArray(contacts.id, part), eq(contacts.status, "lead"))).returning({ id: contacts.id });
    n += rows.length;
  }
  return n;
}
