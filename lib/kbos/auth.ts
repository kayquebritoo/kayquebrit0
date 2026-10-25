// Magic Link (legado/fallback) + login e-mail + senha (fluxo principal).
// Envio via serviço central (`./email`: Resend -> SMTP -> log); em dev sem
// provedor, o link volta na resposta (e no log) para testar sem SMTP.
import { createHash, randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { appUrl, buildMagicLinkEmail, sendEmail } from "./email";
import { loginTokens, sessions, users } from "./schema";
import { ADMIN_EMAIL, isAdminBypass, isAdminEmail, isUuidLike } from "./admin-access";
import { hashPassword, isPasswordStrongEnough, verifyPassword } from "./password";
import { PublicError } from "./http";

export { ADMIN_EMAIL, isAdminEmail, isAdminBypass };

const TOKEN_MINUTES = 15;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestMagicLink(emailRaw: string, name?: string, req?: Request) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PublicError("E-mail inválido.");
  }
  const admin = isAdminEmail(email);
  const d = db();
  let user = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    const rows = await d
      .insert(users)
      .values({
        email,
        name: name?.trim() || (admin ? "Administrador" : email.split("@")[0]),
        // O admin principal nasce (ou é promovido a) admin — sem isso, o
        // guard client-side (`KbosShell admin`) o expulsaria para /portal
        // mesmo com sessão válida.
        role: admin ? "admin" : "cliente",
      })
      .returning();
    user = rows[0];
  } else if (admin && user.role !== "admin") {
    // Auto-reparo: linha criada antes como cliente (ou via briefing).
    const rows = await d
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id))
      .returning();
    user = rows[0] ?? { ...user, role: "admin" as const };
  }
  const token = randomBytes(32).toString("hex");
  await d.insert(loginTokens).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
  });
  const link = `${appUrl(req)}/api/auth/verify?token=${token}`;
  const { subject, html } = buildMagicLinkEmail(link);
  // sendEmail nunca lança — falha só marca `sent: false` (sem quebrar o fluxo).
  const r = await sendEmail(email, subject, html);
  const sent = r.sent;
  if (!sent) {
    console.log(
      `[KBOS auth] magic link para ${email} não enviado por e-mail ` +
        `(${r.error ?? "sem provedor"}). Link: ${process.env.NODE_ENV === "production" ? "[omitido no log de produção]" : link}`
    );
  }
  return {
    sent,
    devLink: process.env.NODE_ENV === "production" ? null : link,
    user,
    // Fallback do admin: o token já foi persistido em `kbos_login_tokens`
    // acima, então a sessão pode ser validada mesmo com o provedor fora do
    // ar — desde que o solicitante apresente o `KBOS_ADMIN_BYPASS_TOKEN`
    // (ver rota POST /api/auth/request). O link em si NUNCA volta na
    // resposta em produção (evita tomada de conta por qualquer visitante).
    adminEmail: admin,
    emailError: sent ? null : (r.error ?? "Provedor de e-mail indisponível."),
  };
}

/**
 * Fallback do administrador principal: cria sessão real imediata sem
 * depender do disparo de e-mail externo.
 *
 * Exige `bypass` válido (`KBOS_ADMIN_BYPASS_TOKEN`) E e-mail do admin.
 * Retorna null quando a credencial não confere (fail-closed) — o chamador
 * deve responder 401/403 sem distinguir os motivos.
 */
export async function createAdminSession(emailRaw: string, bypass: string | null | undefined) {
  const email = emailRaw.trim().toLowerCase();
  if (!isAdminEmail(email) || !isAdminBypass(bypass)) return null;
  const d = db();
  let user = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    const rows = await d
      .insert(users)
      .values({ email, name: "Administrador", role: "admin" })
      .returning();
    user = rows[0];
  } else if (user.role !== "admin") {
    const rows = await d
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id))
      .returning();
    user = rows[0] ?? { ...user, role: "admin" as const };
  }
  const sess = (
    await d
      .insert(sessions)
      .values({ userId: user.id, expiresAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning()
  )[0];
  console.log(`[KBOS auth] sessão admin direta criada para ${email} (bypass).`);
  return { sessionId: sess.id, user };
}

/**
 * Link de acesso gerado pelo admin para enviar à mão (ex.: WhatsApp do Kayque)
 * quando o código não chega. Mesmo armazenamento do Magic Link (só o hash),
 * uso único, validade maior porque o envio é manual.
 */
export const ACCESS_LINK_HOURS = 24;
export async function createAccessLink(emailRaw: string, hours = ACCESS_LINK_HOURS) {
  const email = emailRaw.trim().toLowerCase();
  if (isAdminEmail(email)) throw new PublicError("Link de acesso não é emitido para administrador.");
  const user = (await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  if (!user || user.role === "admin") throw new PublicError("Conta do portal não encontrada.");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  await db().insert(loginTokens).values({ email: user.email, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function consumeMagicLink(token: string) {
  const d = db();
  // Marca como usado e lê na mesma instrução: dois cliques simultâneos não geram duas sessões.
  const row = (
    await d
      .update(loginTokens)
      .set({ consumed: true })
      .where(sql`${loginTokens.tokenHash} = ${hashToken(token)} AND ${loginTokens.consumed} = false AND ${loginTokens.expiresAt} > now()`)
      .returning()
  )[0];
  if (!row) return null;
  const user = (await d.select().from(users).where(eq(users.email, row.email)).limit(1))[0];
  if (!user) return null;
  const sess = (
    await d
      .insert(sessions)
      .values({ userId: user.id, expiresAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning()
  )[0];
  return { sessionId: sess.id, user };
}

export async function destroySession(sessionId: string) {
  // O bypass não existe no banco (comparação em memória) — nada a destruir.
  // O guard uuid evita `invalid input syntax for type uuid` no Postgres.
  if (!sessionId || isAdminBypass(sessionId) || !isUuidLike(sessionId)) return;
  try {
    const { eq: eq2 } = await import("drizzle-orm");
    await db().delete(sessions).where(eq2(sessions.id, sessionId));
  } catch {
    /* sessão já inválida */
  }
}

// ---------- Login e-mail + senha (fluxo principal) ----------

export type PasswordLoginResult =
  | { ok: true; sessionId: string; user: typeof users.$inferSelect; adminBypass: boolean }
  | { ok: false; code: "INVALID" | "NO_PASSWORD" };

/**
 * Login padrão por e-mail + senha.
 * - Admin + senha == bypass (`KBOS_ADMIN_BYPASS_TOKEN`/`KBOS_ADMIN_PASSWORD`):
 *   sessão imediata (acesso direto na VPS, sem depender do banco de senhas).
 * - Demais: exige `password_hash` (scrypt) válido.
 * - Conta sem senha: `NO_PASSWORD` (client orienta a definir via Magic Link).
 * Fail-closed: nunca distingue "e-mail inexistente" de "senha errada".
 */
export async function loginWithPassword(emailRaw: string, password: string): Promise<PasswordLoginResult> {
  const identifier = emailRaw.trim().toLowerCase();
  const email = identifier === "kayque" ? ADMIN_EMAIL : identifier;
  // Bypass do admin vale como senha imediata (VPS).
  if (isAdminEmail(email) && isAdminBypass(password)) {
    const direct = await createAdminSession(email, password);
    if (direct) return { ok: true, sessionId: direct.sessionId, user: direct.user, adminBypass: true };
    return { ok: false, code: "INVALID" };
  }
  const d = db();
  const user = await findLoginUser(email);
  if (!user || !user.passwordHash) {
    // Timing similar ao verify p/ não vazar existência (hash dummy).
    verifyPassword(password, `${"scrypt"}$${"0".repeat(32)}$${"0".repeat(128)}`);
    return { ok: false, code: user ? "NO_PASSWORD" : "INVALID" };
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, code: "INVALID" };
  }
  // Promove o admin principal mesmo se a linha nasceu como cliente.
  let current = user;
  if (isAdminEmail(email) && user.role !== "admin") {
    const rows = await d.update(users).set({ role: "admin" }).where(eq(users.id, user.id)).returning();
    current = rows[0] ?? ({ ...user, role: "admin" as const });
  }
  const sess = (
    await d
      .insert(sessions)
      .values({ userId: current.id, expiresAt: new Date(Date.now() + 30 * 86_400_000) })
      .returning()
  )[0];
  return { ok: true, sessionId: sess.id, user: current, adminBypass: false };
}

/**
 * Define/troca a senha (scrypt) de um usuário.
 * Chamadores autorizados:
 * - sessão válida (troca direta, `userId`),
 * - token bruto do Magic Link (bootstrap: prova posse do e-mail),
 * - bypass do admin (somente p/ o e-mail do admin).
 */
export async function setUserPasswordByToken(emailRaw: string, token: string, newPassword: string) {
  if (!isPasswordStrongEnough(newPassword)) throw new PublicError("Mínimo 8 caracteres.");
  if (!/^[0-9a-f]{32,128}$/i.test(token.trim())) return null;
  const d = db();
  const row = (
    await d.select().from(loginTokens).where(eq(loginTokens.tokenHash, hashToken(token.trim()))).limit(1)
  )[0];
  if (!row || row.consumed || row.expiresAt.getTime() < Date.now()) return null;
  const email = row.email;
  if (emailRaw.trim() && emailRaw.trim().toLowerCase() !== email) return null;
  const user = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) return null;
  const rows = await d
    .update(users)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(users.id, user.id))
    .returning();
  return rows[0] ?? null;
}

export async function setUserPasswordById(userId: string, newPassword: string) {
  if (!isPasswordStrongEnough(newPassword)) throw new PublicError("Mínimo 8 caracteres.");
  const d = db();
  const rows = await d
    .update(users)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(users.id, userId))
    .returning();
  return rows[0] ?? null;
}

/** Identificadores explícitos: nunca usa nome exibido nem prefixo ambíguo de e-mail. */
export async function findLoginUser(raw: string) {
 const value=raw.trim().toLowerCase();
 const identifier=value === "kayque" ? ADMIN_EMAIL : value;
 const [user]=await db().select().from(users).where(sql`lower(${users.email}) = ${identifier} OR lower(${users.username}) = ${identifier}`).limit(1);
 return user;
}
