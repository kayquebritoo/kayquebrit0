import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { appUrlEnv } from "@/lib/kbos/email";
import { grantPortalAccess } from "@/lib/kbos/portal-access";

export const dynamic = "force-dynamic";
const body = z.object({ contactId: z.string().uuid(), email: z.string().trim().max(160).optional(), phone: z.string().trim().max(30).optional(), name: z.string().trim().max(120).optional() });

// POST /api/admin/portal-access — admin dá acesso ao portal a um contato (cria a conta e liga os projetos dele).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const r = await grantPortalAccess(parsed.data);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ...r, loginUrl: `${appUrlEnv()}/entrar` });
  } catch (e) {
    return serverError(e);
  }
}
