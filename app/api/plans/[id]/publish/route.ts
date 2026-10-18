import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { publishClientPlan } from "@/lib/kbos/planning";
import { checkId } from "@/lib/kbos/validators";
import { z } from "zod";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
 const { id } = await params; const bad = checkId(id); if (bad) return bad;
 try {
  const b = z.object({revision:z.number().int().positive()}).safeParse(await req.json());
  if (!b.success) return NextResponse.json({error:"Informe a revisão atual."},{status:400});
  return NextResponse.json({ plan: await publishClientPlan(id,b.data.revision) });
 } catch(e) { return serverError(e); }
}
