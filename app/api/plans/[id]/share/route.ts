import { NextResponse } from "next/server";
import { deny,sessionUser } from "@/lib/kbos/rbac";
import { shareClientPlan } from "@/lib/kbos/planning";
import { checkId } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const denied=deny(await sessionUser(),"admin");if(denied)return denied;
 const {id}=await params;const bad=checkId(id);if(bad)return bad;
 try{const path=await shareClientPlan(id);return NextResponse.json({url:`${(process.env.APP_URL||new URL(req.url).origin).replace(/\/$/,"")}${path}`},{headers:{"Cache-Control":"no-store"}});}catch(e){return serverError(e);}
}
