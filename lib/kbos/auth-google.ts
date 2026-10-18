import * as oidc from "openid-client";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { users,sessions } from "./schema";
import { PublicError } from "./http";
import { appUrlEnv } from "./email";
export const GOOGLE_COOKIE='kbos_google_flow';
export const safeAuthNext=(value:string)=>value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)?value:'';
export function googleConfigured(){return !!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);}
export const googleCallback=()=>`${appUrlEnv()}/api/auth/google/callback/`;
async function config(){
 if(!googleConfigured())throw new PublicError('O acesso com Google ainda não foi configurado.',503);
 const cfg=await oidc.discovery(new URL('https://accounts.google.com'),process.env.GOOGLE_CLIENT_ID!,process.env.GOOGLE_CLIENT_SECRET!);
 oidc.enableNonRepudiationChecks(cfg);
 return cfg;
}
export async function startGoogle(next:string){
 const cfg=await config(),verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
 const url=oidc.buildAuthorizationUrl(cfg,{redirect_uri:googleCallback(),scope:'openid email profile',code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',state,nonce});
 return {url,flow:{verifier,state,nonce,next:safeAuthNext(next),expires:Date.now()+600_000}};
}
export async function finishGoogle(url:URL,raw:string){
 const flow=JSON.parse(raw);
 if(!flow.verifier||!flow.state||!flow.nonce||flow.expires<Date.now())throw new PublicError('A solicitação expirou. Tente novamente.');
 const tokens=await oidc.authorizationCodeGrant(await config(),url,{pkceCodeVerifier:flow.verifier,expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true});
 const claims=tokens.claims();
 if(!claims?.sub||typeof claims.email!=='string'||claims.email_verified!==true)throw new PublicError('Não foi possível confirmar sua conta Google.');
 const [bySubject]=await db().select().from(users).where(eq(users.googleSubject,claims.sub)).limit(1);
 let user=bySubject;
 if(!user){
  // Google só é autoridade do endereço para Gmail e Workspace. Não vincular
  // contas de terceiros apenas porque Google confirmou esse e-mail no passado.
  const authoritative=claims.email.endsWith('@gmail.com') || claims.hd===claims.email.split('@')[1];
  if(!authoritative)throw new PublicError('Entre com sua senha ou código. Este e-mail precisa de vinculação assistida.');
  const [existing]=await db().select().from(users).where(eq(users.email,claims.email.toLowerCase())).limit(1);
  if(!existing || existing.googleSubject)throw new PublicError('Use a conta Google do e-mail já cadastrado no KBOS.');
  const [linked]=await db().update(users).set({googleSubject:claims.sub}).where(and(eq(users.id,existing.id),isNull(users.googleSubject))).returning();
  if(!linked)throw new PublicError('Tente entrar novamente.');
  user=linked;
 }
 const [session]=await db().insert(sessions).values({userId:user.id,expiresAt:new Date(Date.now()+30*86400_000)}).returning();
 return {sessionId:session.id,dest:safeAuthNext(flow.next||'')||(user.role==='admin'?'/admin':'/portal')};
}
