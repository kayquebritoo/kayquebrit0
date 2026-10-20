// Acesso do cliente ao portal: cria (ou reaproveita) a conta e liga os projetos do contato a ela.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { contacts, projects, users } from "./schema";

/** Telefone BR → só dígitos com DDI 55 (o login por WhatsApp exige 12–15 dígitos). */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^\d{12,15}$/.test(full) ? full : null;
}

export type AccessResult =
  | { ok: true; userId: string; email: string; phone: string | null; created: boolean; linked: number }
  | { ok: false; error: string };

export async function grantPortalAccess(input: { contactId: string; email?: string | null; phone?: string | null; name?: string | null }): Promise<AccessResult> {
  const d = db();
  const [c] = await d.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
  if (!c) return { ok: false, error: "Contato não encontrado." };
  const email = (input.email || c.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Informe o e-mail da pessoa (o login usa o e-mail)." };
  const phone = normalizePhone(input.phone || c.phone);
  let [user] = await d.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  let created = false;
  if (!user) {
    [user] = await d.insert(users).values({ email, name: (input.name || c.name).trim(), role: "cliente", phone }).returning();
    created = true;
  } else if (user.role === "admin") {
    return { ok: false, error: "Esse e-mail é de um administrador; use outro e-mail para o acesso do cliente." };
  } else if (phone && !user.phone) {
    await d.update(users).set({ phone }).where(eq(users.id, user.id));
    user = { ...user, phone };
  }
  const linked = await d
    .update(projects)
    .set({ clienteId: user.id })
    .where(and(eq(projects.contactId, c.id), isNull(projects.clienteId)))
    .returning({ id: projects.id });
  return { ok: true, userId: user.id, email, phone: user.phone ?? phone, created, linked: linked.length };
}
