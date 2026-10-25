import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { clientIp } from "@/lib/kbos/rate-limit";
import { accountsOverview, assignAccountProject, disconnectAccount, providerStatus } from "@/lib/kbos/social/connections";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET [?projectId=] — redes (configuradas ou "em breve") e contas conectadas por cliente (sem token).
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  try {
    const providers = providerStatus();
    return NextResponse.json({ configured: providers.some((p) => p.configured), providers, items: await accountsOverview(UUID.test(projectId) ? [projectId] : undefined) });
  } catch (e) { return serverError(e); }
}

// PATCH { id, projectId|null } — de qual cliente/operação é a conta.
export async function PATCH(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ id: z.string().uuid(), projectId: z.string().uuid().nullable() }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ ok: await assignAccountProject(parsed.data.id, parsed.data.projectId, { kind: "admin", userId: user!.id, ip: clientIp(req), userAgent: req.headers.get("user-agent") }) });
  } catch (e) { return serverError(e); }
}

// DELETE ?id= — desconecta: revoga o token na rede (quando é a última conta do login) e apaga daqui.
export async function DELETE(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  try {
    const r = await disconnectAccount(id, { kind: "admin", userId: user!.id, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 404 });
  } catch (e) { return serverError(e); }
}
