import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { listServices } from "@/lib/kbos/services";

// GET /api/admin/services — todos os serviços (inclui inativos) para o painel.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const items = (await listServices({ includeInactive: true })).map((s) => ({
      slug: s.id,
      front: s.front,
      label: s.label,
      tagline: s.tagline,
      description: s.desc,
      priceFrom: s.priceFrom,
      term: s.term,
      includes: s.bullets,
      pitch: s.pitch,
      process: s.process,
      active: s.active,
      custom: s.custom,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return serverError(e);
  }
}
