import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, deals } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { dealCreateSchema, readBody } from "@/lib/kbos/validators";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET /api/deals — pipeline com contato resolvido (join leve).
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const rows = await db()
      .select({
        id: deals.id,
        title: deals.title,
        contactId: deals.contactId,
        stage: deals.stage,
        value: deals.value,
        position: deals.position,
        createdAt: deals.createdAt,
        updatedAt: deals.updatedAt,
        contactName: contacts.name,
        contactEmail: contacts.email,
        contactCompany: contacts.company,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .orderBy(asc(deals.position), desc(deals.updatedAt))
      .limit(500);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST /api/deals — cria negócio no pipeline.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, dealCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const rows = await db()
      .insert(deals)
      .values({
        title: b.title,
        contactId: b.contactId ?? null,
        stage: b.stage ?? "prospecting",
        value: b.value ?? null,
        position: b.position ?? 0,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
