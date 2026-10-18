import { randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { findLoginUser, normalizeLoginPhone, ADMIN_EMAIL } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { sendEmail } from "./email";
import { sendEvolutionText } from "./whatsapp";
import { PublicError } from "./http";

export type CodeChannel = "whatsapp" | "email";
const generic = "Se os dados estiverem cadastrados, você receberá um código de 6 dígitos. Ele vale por 5 minutos.";
export async function requestAccessCode(identifier: string, channel: CodeChannel) {
 const challengeId=randomUUID();
 const user=await findLoginUser(identifier);
 // Resposta igual para contas inexistentes ou sem o canal cadastrado.
 const phone=normalizeLoginPhone(user?.phone || (user?.email===ADMIN_EMAIL ? process.env.ASSISTANT_OWNER_PHONE : "") || "") || "";
 if(!user || (channel==='whatsapp' && !/^\d{12,15}$/.test(phone))) return {challengeId,message:generic};
 const code=String(randomInt(0,1_000_000)).padStart(6,'0');
 // Uma solicitação por conta a cada 60 s, mesmo mudando IP/canal.
 const claimed=await db().execute(sql`WITH account AS (
 UPDATE kbos_users SET auth_code_requested_at=now() WHERE id=${user.id}::uuid
 AND (auth_code_requested_at IS NULL OR auth_code_requested_at<now()-interval '60 seconds') RETURNING id
 ) INSERT INTO kbos_auth_challenges (id,user_id,code_hash,channel,expires_at)
 SELECT ${challengeId}::uuid,id,${hashPassword(code)},${channel},now()+interval '5 minutes' FROM account RETURNING id`);
 if(!claimed.rows.length) return {challengeId,message:generic};
 try {
  const message=`Seu código de acesso ao KBOS é ${code}. Válido por 5 minutos. Não compartilhe este código. Se não solicitou, ignore esta mensagem.`;
  if(channel==='whatsapp') await sendEvolutionText(phone,message,{signal:AbortSignal.timeout(8000)});
  else {const result=await sendEmail(user.email,'Seu código de acesso — KBOS',`<p>Seu código de acesso:</p><p style="font-size:32px;letter-spacing:8px"><strong>${code}</strong></p><p>Válido por 5 minutos. Não compartilhe. Se não solicitou, ignore esta mensagem.</p>`);if(!result.sent)throw new Error('delivery');}
 } catch {
  await db().execute(sql`UPDATE kbos_auth_challenges SET consumed=true WHERE id=${challengeId}::uuid`);
  console.warn('[KBOS auth] Não foi possível entregar um código de acesso.');
 }
 return {challengeId,message:generic};
}
/** Cadastro só vira conta depois da prova de posse; nunca grava senha não verificada. */
export async function requestRegistrationCode(name:string,identifier:string,channel:CodeChannel){
 const phone=normalizeLoginPhone(identifier);
 const email=identifier.trim().toLowerCase();
 if(channel==='whatsapp'&&!phone)throw new PublicError('Informe seu WhatsApp com DDD. Para outro país, inclua + e o DDI.');
 if(channel==='email'&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.endsWith('@users.kbos.invalid')))throw new PublicError('Informe um e-mail válido.');
 const existing=await findLoginUser(channel==='whatsapp'?phone!:email);
 if(existing)return requestAccessCode(channel==='whatsapp'?phone!:email,channel);
 const challengeId=randomUUID(),destination=channel==='whatsapp'?`wa:${phone}`:`email:${email}`;
 if(phone&&channel==='whatsapp'){
  const duplicate=await db().execute(sql`SELECT id FROM kbos_users WHERE (CASE WHEN length(regexp_replace(phone,'[^0-9]','','g')) IN (10,11) THEN '55'||regexp_replace(phone,'[^0-9]','','g') ELSE regexp_replace(phone,'[^0-9]','','g') END)=${phone} LIMIT 1`);
  if(duplicate.rows.length)return {challengeId,message:generic};
 }
 const code=String(randomInt(0,1_000_000)).padStart(6,'0');
 const registration={name:name.trim(),email:channel==='whatsapp'?`wa-${phone}@users.kbos.invalid`:email,phone:channel==='whatsapp'?phone:null};
 const claimed=await db().execute(sql`INSERT INTO kbos_auth_challenges(id,code_hash,channel,expires_at,registration,destination)
 VALUES(${challengeId}::uuid,${hashPassword(code)},${channel},now()+interval '5 minutes',${JSON.stringify(registration)}::jsonb,${destination})
 ON CONFLICT(destination) WHERE consumed=false DO UPDATE SET id=excluded.id,code_hash=excluded.code_hash,channel=excluded.channel,
 expires_at=excluded.expires_at,registration=excluded.registration,attempts=0,created_at=now()
 WHERE kbos_auth_challenges.created_at<now()-interval '60 seconds' RETURNING id`);
 if(!claimed.rows.length)return {challengeId,message:generic};
 try{
  if(channel==='whatsapp')await sendEvolutionText(phone!,`Seu código de acesso ao KBOS é ${code}. Válido por 5 minutos. Não compartilhe este código.`,{signal:AbortSignal.timeout(8000)});
  else{const delivered=await sendEmail(email,'Confirme seu cadastro — KBOS',`<p>Seu código de confirmação:</p><p style="font-size:32px;letter-spacing:8px"><strong>${code}</strong></p><p>Válido por 5 minutos. Não compartilhe este código.</p>`);if(!delivered.sent)throw new Error('delivery');}
 }catch{await db().execute(sql`UPDATE kbos_auth_challenges SET consumed=true WHERE id=${challengeId}::uuid`);console.warn('[KBOS auth] Não foi possível entregar confirmação de cadastro.');}
 return {challengeId,message:generic};
}
export async function verifyAccessCode(id:string,code:string) {
 // Consome uma tentativa antes de comparar: concorrência não ultrapassa o limite.
 const result=await db().execute(sql`UPDATE kbos_auth_challenges SET attempts=attempts+1
 WHERE id=${id}::uuid AND consumed=false AND attempts<5 AND expires_at>now()
 RETURNING code_hash`);
 if(!result.rows[0] || !verifyPassword(code,String(result.rows[0].code_hash))) throw new PublicError('Código inválido ou expirado. Confira os números ou solicite outro.',400);
 // Uso único e criação da sessão são atômicos.
 const session=await db().execute(sql`WITH claimed AS (
 UPDATE kbos_auth_challenges SET consumed=true WHERE id=${id}::uuid AND consumed=false AND expires_at>now() RETURNING user_id,registration
 ), created AS (
 INSERT INTO kbos_users(email,name,phone,role)
 SELECT registration->>'email',registration->>'name',registration->>'phone','cliente'
 FROM claimed WHERE user_id IS NULL AND registration IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM kbos_users u WHERE u.email=registration->>'email'
 OR (registration->>'phone' IS NOT NULL AND (CASE WHEN length(regexp_replace(u.phone,'[^0-9]','','g')) IN (10,11) THEN '55'||regexp_replace(u.phone,'[^0-9]','','g') ELSE regexp_replace(u.phone,'[^0-9]','','g') END)=registration->>'phone'))
 ON CONFLICT(email) DO NOTHING RETURNING id
 ), account AS (
 SELECT user_id AS id FROM claimed WHERE user_id IS NOT NULL UNION ALL SELECT id FROM created
 ) INSERT INTO kbos_sessions (user_id,expires_at) SELECT id,now()+interval '30 days' FROM account RETURNING id,user_id`);
 if(!session.rows[0])throw new PublicError('Este código já foi usado. Solicite outro.',400);
 return {sessionId:String(session.rows[0].id),userId:String(session.rows[0].user_id)};
}
