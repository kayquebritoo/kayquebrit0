import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { issueConsent } from "@/lib/kbos/showcase";

// POST /api/admin/cases/:id/consent — gera o link de autorização para o cliente.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const r = await issueConsent(id);
    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const url = `${base}/autorizacao/${r.token}/`;
    let waLink: string | null = null;
    if (r.contactId) {
      const [c] = await db().select({ name: contacts.name, phone: contacts.phone }).from(contacts).where(eq(contacts.id, r.contactId)).limit(1);
      const digits = (c?.phone ?? "").replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 15) {
        const phone = digits.length <= 11 ? `55${digits}` : digits;
        const first = (c?.name ?? "").split(" ")[0];
        const text = `Oi${first ? `, ${first}` : ""}! Posso mostrar o nosso projeto "${r.title}" no meu portfólio? Veja como vai ficar e escolha o que libera: ${url}`;
        waLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      }
    }
    return NextResponse.json({ url, expiresAt: r.expiresAt, waLink }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError(e);
  }
}
