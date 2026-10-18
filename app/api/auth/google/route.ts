import { NextResponse } from "next/server";
import { startGoogle,GOOGLE_COOKIE } from "@/lib/kbos/auth-google";
import { sessionUser } from "@/lib/kbos/rbac";
import { appUrlEnv } from "@/lib/kbos/email";
import { withRateLimit } from "@/lib/kbos/rate-limit";
export async function GET(req:Request){
 const limited=await withRateLimit(req,'auth:request');if(limited)return limited;
 try{const query=new URL(req.url).searchParams;const connect=query.get('connect')==='1';const me=connect?await sessionUser():null;if(connect&&!me)return NextResponse.redirect(new URL('/entrar/',appUrlEnv()));const {url,flow}=await startGoogle(query.get('next')||'',me?.id);const res=NextResponse.redirect(url);res.cookies.set(GOOGLE_COOKIE,JSON.stringify(flow),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth/google',maxAge:600});return res;}
 catch{return NextResponse.redirect(new URL('/entrar/?erro=google',appUrlEnv()));}
}
