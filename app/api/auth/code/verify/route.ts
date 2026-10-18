import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { verifyAccessCode } from "@/lib/kbos/auth-code";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { db } from "@/lib/kbos/db";
import { users } from "@/lib/kbos/schema";
import { SESSION_COOKIE,sessionCookieOptions,SESSION_DAYS } from "@/lib/kbos/rbac";
const body=z.object({challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)});
export async function POST(req:Request){
 const limited=await withRateLimit(req,'auth:verify');if(limited)return limited;
 try{const parsed=await readBody(req,body);if('error'in parsed)return parsed.error;
 const session=await verifyAccessCode(parsed.data.challengeId,parsed.data.code);
 const [user]=await db().select({role:users.role}).from(users).where(eq(users.id,session.userId)).limit(1);
 const res=NextResponse.json({ok:true,dest:user?.role==='admin'?'/admin':'/portal'});res.cookies.set(SESSION_COOKIE,session.sessionId,sessionCookieOptions(SESSION_DAYS*86400));return res;
 }catch(e){return serverError(e);}
}
