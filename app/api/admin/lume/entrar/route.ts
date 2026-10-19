import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { LUME_ONLINE_DEFAULT, lumeEntryUrl } from "@/lib/kbos/lume";

export const dynamic = "force-dynamic";

// GET /api/admin/lume/entrar — admin logado é levado ao Lume online já autenticado.
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const secret = (process.env.LUME_API_TOKEN || "").trim();
  if (!secret) return NextResponse.redirect(new URL("/admin/lume?erro=config", req.url));
  const base = (process.env.LUME_URL || LUME_ONLINE_DEFAULT).trim();
  return NextResponse.redirect(lumeEntryUrl(base, secret));
}
