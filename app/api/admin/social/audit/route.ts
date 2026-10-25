import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { listAudit } from "@/lib/kbos/social/connections";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET [?projectId=] — auditoria das conexões: quem conectou/desconectou, quando, escopos e IP.
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  try { return NextResponse.json({ items: await listAudit({ projectId: UUID.test(projectId) ? projectId : undefined, limit: 60 }) }); } catch (e) { return serverError(e); }
}
