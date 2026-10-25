import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { clientIp } from "@/lib/kbos/rate-limit";
import { createConnectLink, listConnectLinks, revokeConnectLink } from "@/lib/kbos/social/connections";
import { SocialError } from "@/lib/kbos/social/types";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET ?projectId= — links de conexão do cliente (o token não volta: só existe na hora de criar).
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  if (!UUID.test(projectId)) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
  try { return NextResponse.json({ items: await listConnectLinks(projectId) }); } catch (e) { return serverError(e); }
}

// POST { projectId } — link novo (7 dias) para mandar ao cliente no WhatsApp.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ projectId: z.string().uuid() }));
    if ("error" in parsed) return parsed.error;
    const link = await createConnectLink(parsed.data.projectId, { kind: "admin", userId: user!.id, ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json(link, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof SocialError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}

// DELETE ?id= — cancela o link antes de vencer.
export async function DELETE(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  try { return NextResponse.json({ ok: await revokeConnectLink(id, { kind: "admin", userId: user!.id, ip: clientIp(req), userAgent: req.headers.get("user-agent") }) }); } catch (e) { return serverError(e); }
}
