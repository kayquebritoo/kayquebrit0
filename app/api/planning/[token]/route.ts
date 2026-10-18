import { NextResponse } from "next/server";
import { publicClientPlan, reviewClientPlan } from "@/lib/kbos/planning";
import { serverError } from "@/lib/kbos/http";
import { withRateLimit } from "@/lib/kbos/rate-limit";
const headers = { "Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer", "X-Robots-Tag":"noindex, nofollow" };
export async function GET(_req: Request,{params}:{params:Promise<{token:string}>}) {
 try {return NextResponse.json(await publicClientPlan((await params).token),{headers});}catch(e){return serverError(e);}
}
export async function POST(req: Request,{params}:{params:Promise<{token:string}>}) {
 const limited=await withRateLimit(req,"planning:review"); if(limited)return limited;
 let body:unknown; try {body=await req.json();}catch{return NextResponse.json({error:"JSON inválido."},{status:400});}
 try {return NextResponse.json(await reviewClientPlan((await params).token,body),{headers});}catch(e){return serverError(e);}
}
