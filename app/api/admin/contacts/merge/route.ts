import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { mergeContacts } from "@/lib/kbos/contact-merge";

export const dynamic = "force-dynamic";

const schema = z.object({ keepId: z.string().uuid(), removeId: z.string().uuid() });

// POST /api/admin/contacts/merge — junta um contato repetido em outro (admin).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const body = await readBody(req, schema);
  if ("error" in body) return body.error;
  try {
    await mergeContacts(body.data.keepId, body.data.removeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && /diferentes|não encontrado/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
