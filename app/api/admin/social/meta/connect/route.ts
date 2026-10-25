import { NextResponse } from "next/server";
import { appUrlEnv } from "@/lib/kbos/email";

export const dynamic = "force-dynamic";

// GET — caminho antigo do botão da Meta: agora o login de todas as redes começa em /api/social/<rede>/connect/.
export async function GET(req: Request) {
  const u = new URL("/api/social/meta/connect/", appUrlEnv());
  u.search = new URL(req.url).search;
  return NextResponse.redirect(u);
}
