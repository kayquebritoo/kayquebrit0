import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { caseSchema } from "@/lib/kbos/showcase-schema";
import { deleteCase, updateCase } from "@/lib/kbos/showcase";

// PUT /api/admin/cases/:id — salva. Se o conteúdo visível mudou depois da autorização, volta para rascunho.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  const body = await readBody(req, caseSchema);
  if ("error" in body) return body.error;
  try {
    const r = await updateCase(id, body.data as never);
    revalidatePath("/trabalho", "layout");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    await deleteCase(id);
    revalidatePath("/trabalho", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
