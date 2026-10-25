import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { SplitError, applySplit, planFor, revertSplit } from "@/lib/kbos/content-split";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (e: unknown) => (e instanceof SplitError ? NextResponse.json({ error: e.message }, { status: 400 }) : serverError(e));

// GET ?projectId= — SOMENTE LEITURA: quantos posts de cada marca iriam para cada operação.
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!UUID.test(projectId)) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
  try { return NextResponse.json(await planFor(projectId), { headers: { "Cache-Control": "no-store" } }); } catch (e) { return fail(e); }
}

// POST { projectId, confirm: "SEPARAR", mapping: [{ brand, titulo }] } — aplica e devolve o id para desfazer.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, z.object({ projectId: z.string().uuid(), confirm: z.literal("SEPARAR"), mapping: z.array(z.object({ brand: z.string().max(60), titulo: z.string().max(160) })).min(1).max(10) }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json(await applySplit(parsed.data.projectId, parsed.data.mapping, user!.id));
  } catch (e) { return fail(e); }
}

// DELETE ?moveId= — desfaz a separação.
export async function DELETE(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const moveId = new URL(req.url).searchParams.get("moveId") ?? "";
  if (!UUID.test(moveId)) return NextResponse.json({ error: "Movimentação inválida." }, { status: 400 });
  try { return NextResponse.json(await revertSplit(moveId)); } catch (e) { return fail(e); }
}
