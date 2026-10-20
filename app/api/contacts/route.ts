import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { CONTACT_EXTRA_KEYS, contactCreateSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET /api/contacts?status=lead&q=busca — equipe (admin/bypass incluso).
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") || "").trim();
    // Padrão 300; o CRM pede mais (até 5000) para não esconder clientes atrás de uma importação grande.
    const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit")) || 300));
    const filters = [];
    if (status && ["lead", "client", "partner", "archived"].includes(status)) {
      filters.push(eq(contacts.status, status as "lead" | "client" | "partner" | "archived"));
    }
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(contacts.name, like),
          ilike(contacts.email, like),
          ilike(contacts.company, like),
          ilike(contacts.phone, like),
          ilike(contacts.document, like),
          ilike(contacts.legalName, like)
        )
      );
    }
    const rows = await db()
      .select()
      .from(contacts)
      .where(filters.length ? and(...filters.filter(Boolean) as never[]) : undefined)
      .orderBy(desc(contacts.updatedAt))
      .limit(limit);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/contacts — cria contato (admin/equipe).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, contactCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const rows = await db()
      .insert(contacts)
      .values({
        name: b.name,
        email: b.email?.toLowerCase() || null,
        phone: b.phone || null,
        company: b.company || null,
        status: b.status ?? "lead",
        notes: b.notes || null,
        ...Object.fromEntries(CONTACT_EXTRA_KEYS.map((k) => [k, b[k] || null])),
        kind: b.kind ?? (b.document && b.document.length > 14 ? "pj" : "pf"),
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
