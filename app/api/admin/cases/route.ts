import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { readBody } from "@/lib/kbos/validators";
import { caseSchema } from "@/lib/kbos/showcase-schema";
import { createCase, legacyPending, listCasesAdmin } from "@/lib/kbos/showcase";

export const dynamic = "force-dynamic";

// GET /api/admin/cases — todos os cases do banco, com estado da autorização.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const [items, legacy] = await Promise.all([listCasesAdmin(), legacyPending()]);
    return NextResponse.json({ items, legacy: legacy.map((p) => ({ slug: p.slug, title: p.title, service: p.service })) });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/admin/cases — cria um case em rascunho.
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const body = await readBody(req, caseSchema);
  if ("error" in body) return body.error;
  if (!body.data.title) return NextResponse.json({ error: "Dê um título ao case." }, { status: 400 });
  try {
    const id = await createCase({ ...body.data, title: body.data.title } as never);
    revalidatePath("/trabalho", "layout");
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
