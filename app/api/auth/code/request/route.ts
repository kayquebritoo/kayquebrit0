import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAccessCode } from "@/lib/kbos/auth-code";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
const body=z.object({identifier:z.string().trim().min(1).max(160),channel:z.enum(['whatsapp','email'])});
export async function POST(req:Request){
 const limited=await withRateLimit(req,'auth:request');if(limited)return limited;
 try{const parsed=await readBody(req,body);if('error'in parsed)return parsed.error;return NextResponse.json(await requestAccessCode(parsed.data.identifier,parsed.data.channel),{headers:{'Cache-Control':'no-store'}});}catch(e){return serverError(e);}
}
