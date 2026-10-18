import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { PublicError, serverError } from "@/lib/kbos/http";
import { readUploadForm, uploadSaleFile } from "@/lib/kbos/sale-uploads";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { db } from "@/lib/kbos/db";
import { sql } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const result = await db().execute(sql`SELECT id, name, size, sha256 FROM kbos_budget_uploads WHERE budget_id = ${id}::uuid ORDER BY created_at`);
    return NextResponse.json({ items: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "proposals:upload");
  if (limited) return limited;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const form = await readUploadForm(req);
    const file = form.get("file");
    if (!file || typeof file === "string") throw new PublicError("Selecione um arquivo.");
    const item = await uploadSaleFile(id, file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ item }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return serverError(e); }
}
