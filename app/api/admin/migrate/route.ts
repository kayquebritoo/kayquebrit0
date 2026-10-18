import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { CLEANUP_GROUP_CONTACTS, ensureSchema } from "@/lib/kbos/migrations";

// POST /api/admin/migrate[?cleanup=1] — reaplica as migrações idempotentes
// e, com cleanup, remove os contatos-fantasma criados por grupos.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const result = await ensureSchema(true);
    let removed: number | null = null;
    if (new URL(req.url).searchParams.get("cleanup") === "1") {
      const rows = (await db().execute(sql.raw(CLEANUP_GROUP_CONTACTS))) as unknown as { rows?: unknown[] } | unknown[];
      removed = Array.isArray(rows) ? rows.length : rows.rows?.length ?? 0;
    }
    return NextResponse.json({ ok: result.failed.length === 0, applied: result.ok, failed: result.failed, removed });
  } catch (e) {
    return serverError(e);
  }
}
