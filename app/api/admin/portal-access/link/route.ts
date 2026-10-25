import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { appUrlEnv } from "@/lib/kbos/email";
import { grantPortalAccess } from "@/lib/kbos/portal-access";
import { createAccessLink } from "@/lib/kbos/auth";

export const dynamic = "force-dynamic";
const body = z.object({ contactId: z.string().uuid(), email: z.string().trim().max(160).optional(), phone: z.string().trim().max(30).optional(), name: z.string().trim().max(120).optional() });

// POST /api/admin/portal-access/link — garante a conta do contato e gera um link de acesso de uso único (24 h)
// para o admin enviar à mão. O token vai no fragmento (#): não chega ao servidor em GETs nem a prévias de link.
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const access = await grantPortalAccess(parsed.data);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: 400 });
    const { token, expiresAt } = await createAccessLink(access.email);
    return NextResponse.json({ ...access, accessUrl: `${appUrlEnv()}/entrar/link/#${token}`, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    return serverError(e);
  }
}
