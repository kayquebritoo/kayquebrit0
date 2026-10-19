import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { importLegacyCases } from "@/lib/kbos/showcase";

export const dynamic = "force-dynamic";

// POST /api/admin/cases/import — traz para o painel os cases que hoje só existem no código do site.
export async function POST() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const r = await importLegacyCases();
    revalidatePath("/trabalho", "layout");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return serverError(e);
  }
}
