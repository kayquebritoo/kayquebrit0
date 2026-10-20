import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { LUME_ONLINE_DEFAULT, lumeEntryUrl, lumePastaPath, safeLumePath } from "@/lib/kbos/lume";

export const dynamic = "force-dynamic";

// GET /api/admin/lume/entrar[?pasta=Hotel | ?ir=/caminho] — admin logado é levado ao Lume online já autenticado.
// `pasta` abre o acervo filtrado por empresa/pasta (atalhos do cliente no KBOS).
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const secret = (process.env.LUME_API_TOKEN || "").trim();
  if (!secret) return NextResponse.redirect(new URL("/admin/lume?erro=config", req.url));
  const base = (process.env.LUME_URL || LUME_ONLINE_DEFAULT).trim();
  const sp = new URL(req.url).searchParams;
  const pasta = (sp.get("pasta") || "").trim().slice(0, 80);
  const ir = pasta ? lumePastaPath(pasta) : safeLumePath(sp.get("ir"));
  return NextResponse.redirect(lumeEntryUrl(base, secret, undefined, ir));
}
