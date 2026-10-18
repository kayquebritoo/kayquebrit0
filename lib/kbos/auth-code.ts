import { randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { findLoginUser, ADMIN_EMAIL } from "./auth";
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
 const phone=(user?.phone || (user?.email===ADMIN_EMAIL ? process.env.ASSISTANT_OWNER_PHONE : "") || "").replace(/\D/g,"");
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
export async function verifyAccessCode(id:string,code:string) {
 // Consome uma tentativa antes de comparar: concorrência não ultrapassa o limite.
 const result=await db().execute(sql`UPDATE kbos_auth_challenges SET attempts=attempts+1
 WHERE id=${id}::uuid AND consumed=false AND attempts<5 AND expires_at>now()
 RETURNING code_hash`);
 if(!result.rows[0] || !verifyPassword(code,String(result.rows[0].code_hash))) throw new PublicError('Código inválido ou expirado. Confira os números ou solicite outro.',400);
 // Uso único e criação da sessão são atômicos.
 const session=await db().execute(sql`WITH claimed AS (
 UPDATE kbos_auth_challenges SET consumed=true WHERE id=${id}::uuid AND consumed=false AND expires_at>now() RETURNING user_id
 ) INSERT INTO kbos_sessions (user_id,expires_at) SELECT user_id,now()+interval '30 days' FROM claimed RETURNING id,user_id`);
 if(!session.rows[0])throw new PublicError('Este código já foi usado. Solicite outro.',400);
 return {sessionId:String(session.rows[0].id),userId:String(session.rows[0].user_id)};
}
