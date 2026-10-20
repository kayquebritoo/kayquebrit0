import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { lumePairCode } from "@/lib/kbos/lume";

export const dynamic = "force-dynamic";

// GET /api/admin/lume/codigo — código de 8 letras para entrar no app instalado do Lume (iPhone/Android).
// O app instalado tem cookies próprios, separados do Safari; por isso entra com este código.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const secret = (process.env.LUME_API_TOKEN || "").trim();
  if (!secret) return NextResponse.json({ error: "O KBOS ainda não tem o token do Lume (LUME_API_TOKEN)." }, { status: 503 });
  return NextResponse.json(lumePairCode(secret), { headers: { "Cache-Control": "no-store" } });
}
