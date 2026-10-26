import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { dataMoves } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { applyConsolidation, consolidationFor, ConsolidationError, revertConsolidation } from "@/lib/kbos/content-consolidation";
export const dynamic = "force-dynamic";
const scope = z.object({ projectId: z.string().uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const fail = (e: unknown) => e instanceof ConsolidationError ? NextResponse.json({ error: e.message }, { status: 409 }) : serverError(e);
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
  const p = scope.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return NextResponse.json({ error: "Projeto/mês inválidos." }, { status: 400 });
  try { const moves = await db().select({id:dataMoves.id,payload:dataMoves.payload}).from(dataMoves).where(and(eq(dataMoves.kind,"consolidar-conteudos"),isNull(dataMoves.revertedAt),sql`${dataMoves.payload}->>'projectId' = ${p.data.projectId}`,sql`${dataMoves.payload}->>'month' = ${p.data.month}`));
    return NextResponse.json({ moves: moves.map(m => ({ id:m.id, count: (m.payload.sourceIds as string[]).length })), groups: (await consolidationFor(p.data.projectId, p.data.month)).map(g => ({title:g.title,brand:g.brand,day:g.day,items:g.items,keeperId:g.keeperId,sourceIds:g.sourceIds,version:g.version,conflicts:g.conflicts,safe:g.safe})) }, { headers: { "Cache-Control": "no-store" } }); } catch(e) { return fail(e); }
}
export async function POST(req: Request) {
  const user = await sessionUser(); const denied = deny(user, "admin"); if (denied) return denied;
  const p = await readBody(req, scope.extend({ keeperId: z.string().uuid(), version: z.string().regex(/^[a-f0-9]{64}$/) })); if ("error" in p) return p.error;
  try { return NextResponse.json(await applyConsolidation(p.data.projectId, p.data.month, p.data.keeperId, p.data.version, user!.id)); } catch(e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
  const id=z.string().uuid().safeParse(new URL(req.url).searchParams.get("moveId"));
  if (!id.success) return NextResponse.json({error:"Movimentação inválida."},{status:400});
  try { return NextResponse.json(await revertConsolidation(id.data)); } catch(e) { return fail(e); }
}
