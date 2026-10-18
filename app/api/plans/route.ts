import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { listClientPlans } from "@/lib/kbos/planning";
export async function GET() {
 const denied = deny(await sessionUser(), "admin"); if (denied) return denied;
 try { return NextResponse.json({ items: await listClientPlans() }); } catch(e) { return serverError(e); }
}
