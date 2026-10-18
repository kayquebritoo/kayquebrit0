import { NextResponse } from "next/server";
import { listServices } from "@/lib/kbos/services";
import { toLite } from "@/lib/kbos/service-catalog";

// GET /api/services — catálogo público (valores e o que está incluso).
// Alimenta o seletor de serviços dos orçamentos e qualquer tela do KBOS.
export async function GET() {
  const items = (await listServices()).map(toLite);
  return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
}
