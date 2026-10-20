import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readHealth } from "@/lib/kbos/wa-health";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp/health — estado guardado pelo monitor (para a faixa vermelha no KBOS).
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const h = await readHealth();
  return NextResponse.json({ down: !!h && h.alertedAt != null, since: h?.since ?? null, state: h?.state ?? "unknown" });
}
