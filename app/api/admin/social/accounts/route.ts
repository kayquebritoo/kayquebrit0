import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { metaConfigured } from "@/lib/kbos/meta";
import { assignAccount, listAccounts, removeAccount } from "@/lib/kbos/social-publish";

export const dynamic = "force-dynamic";

// GET — contas conectadas (sem token) e se o app da Meta está configurado.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try { return NextResponse.json({ configured: metaConfigured(), items: await listAccounts() }); } catch (e) { return serverError(e); }
}

// PATCH { id, projectId|null } — de qual projeto/operação é a conta.
export async function PATCH(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ id: z.string().uuid(), projectId: z.string().uuid().nullable() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ ok: await assignAccount(parsed.data.id, parsed.data.projectId) });
  } catch (e) { return serverError(e); }
}

// DELETE ?id= — desconecta (apaga o token guardado).
export async function DELETE(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  try { await removeAccount(id); return NextResponse.json({ ok: true }); } catch (e) { return serverError(e); }
}
