import { NextResponse } from "next/server";
import { and, asc, gte, lte } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { events } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { eventCreateSchema, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

// Agenda pessoal — admin-only.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const q = new URL(req.url).searchParams;
    const from = q.get("from");
    const to = q.get("to");
    const upcoming = q.get("upcoming");
    const filters = [];
    if (upcoming === "1") {
      filters.push(gte(events.startTime, new Date()));
    } else {
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime())) filters.push(gte(events.startTime, d));
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime())) filters.push(lte(events.startTime, d));
      }
    }
    const rows = await db()
      .select()
      .from(events)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(events.startTime))
      .limit(300);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, eventCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const rows = await db()
      .insert(events)
      .values({
        title: b.title,
        description: b.description || null,
        startTime: new Date(b.startTime),
        endTime: b.endTime ? new Date(b.endTime) : null,
        location: b.location || null,
        reminderMinutesBefore: b.reminderMinutesBefore ?? 15,
      })
      .returning();
    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
