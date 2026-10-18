import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { adminClientPlan, saveClientPlan } from "@/lib/kbos/planning";
import { checkId } from "@/lib/kbos/validators";
import { z } from "zod";
const patch = z.object({ revision: z.number().int().positive(), document: z.unknown() });
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
 const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
 const { id } = await params; const bad = checkId(id); if (bad) return bad;
 try { return NextResponse.json(await adminClientPlan(id)); } catch(e) { return serverError(e); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
 const { id } = await params; const bad = checkId(id); if (bad) return bad;
 try {
  const b = patch.safeParse(await req.json()); if (!b.success) return NextResponse.json({error:"Dados inválidos."},{status:400});
  return NextResponse.json({ plan: await saveClientPlan(id, b.data.revision, b.data.document) });
 } catch(e) { return serverError(e); }
}
