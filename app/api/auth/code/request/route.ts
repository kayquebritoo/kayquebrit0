import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAccessCode, requestRegistrationCode } from "@/lib/kbos/auth-code";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
const body=z.object({identifier:z.string().trim().min(1).max(160),channel:z.enum(['whatsapp','email']),name:z.string().trim().min(2).max(100).optional(),register:z.boolean().optional()});
export async function POST(req:Request){
 const limited=await withRateLimit(req,'auth:request',true);if(limited)return limited;
 try{const parsed=await readBody(req,body);if('error'in parsed)return parsed.error;const {identifier,channel,name,register}=parsed.data;if(register&&!name)return NextResponse.json({error:"Informe seu nome."},{status:400});return NextResponse.json(await (register?requestRegistrationCode(name!,identifier,channel):requestAccessCode(identifier,channel)),{headers:{'Cache-Control':'no-store'}});}catch(e){return serverError(e);}
}
