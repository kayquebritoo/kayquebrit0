import { NextRequest,NextResponse } from "next/server";
import { finishGoogle,GOOGLE_COOKIE,googleCallback } from "@/lib/kbos/auth-google";
import { appUrlEnv } from "@/lib/kbos/email";
import { SESSION_COOKIE,sessionCookieOptions,SESSION_DAYS } from "@/lib/kbos/rbac";
export async function GET(req:NextRequest){
 let res:NextResponse;
 try{const url=new URL(googleCallback());url.search=new URL(req.url).search;const result=await finishGoogle(url,req.cookies.get(GOOGLE_COOKIE)?.value||'');res=NextResponse.redirect(new URL(result.dest,appUrlEnv()));res.cookies.set(SESSION_COOKIE,result.sessionId,sessionCookieOptions(SESSION_DAYS*86400));}
 catch{res=NextResponse.redirect(new URL('/entrar/?erro=google',appUrlEnv()));}
 res.cookies.set(GOOGLE_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/auth/google',maxAge:0});return res;
}
