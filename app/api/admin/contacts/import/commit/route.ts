import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { commitImport } from "@/lib/kbos/contact-import-db";
import { commitBody } from "@/lib/kbos/contact-import-api";
import type { ImportRecord } from "@/lib/kbos/contact-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/contacts/import/commit — aplica a importação (o servidor refaz o plano; o navegador só manda as decisões).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, commitBody);
    if ("error" in parsed) return parsed.error;
    const result = await commitImport(parsed.data.records as ImportRecord[], parsed.data.decisions);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return serverError(e);
  }
}
