import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { campaigns } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { campaignCreateSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET /api/campaigns — lista (equipe). Contadores vêm do banco (tempo real).
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const rows = await db().select().from(campaigns).orderBy(desc(campaigns.updatedAt)).limit(200);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/campaigns — cria rascunho (o disparo é via `.../[id]/dispatch`).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, campaignCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const rows = await db()
      .insert(campaigns)
      .values({
        title: b.title,
        messageTemplate: b.messageTemplate,
        targetStatus: b.targetStatus ?? "all",
        scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
