import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { archiveLeads } from "@/lib/kbos/contact-archive";

export const dynamic = "force-dynamic";
const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(3000) });

// POST /api/admin/contacts/archive — arquiva leads em lote (admin). Não apaga e não mexe em clientes.
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const body = await readBody(req, schema);
  if ("error" in body) return body.error;
  try {
    const archived = await archiveLeads(body.data.ids);
    return NextResponse.json({ ok: true, archived });
  } catch (e) {
    return serverError(e);
  }
}
