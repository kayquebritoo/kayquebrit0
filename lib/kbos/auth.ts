// Magic Link: token de uso único (15 min) -> sessão de 30 dias.
// Envio via Resend quando configurado; em dev, o link volta na resposta
// (e no log) para testar sem SMTP.
import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { loginTokens, sessions, users } from "./schema";

const TOKEN_MINUTES = 15;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    console.log(`[KBOS auth] sem Resend — email para ${to}: ${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) console.error("[KBOS auth] Resend falhou:", await res.text());
  return res.ok;
}

export async function requestMagicLink(emailRaw: string, name?: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("E-mail inválido.");
  }
  const d = db();
  let user = (await d.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    const rows = await d
      .insert(users)
      .values({ email, name: name?.trim() || email.split("@")[0], role: "cliente" })
      .returning();
    user = rows[0];
  }
  const token = randomBytes(32).toString("hex");
  await d.insert(loginTokens).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
  });
  const link = `${appUrl()}/api/auth/verify?token=${token}`;
  const sent = await sendEmail(
    email,
    "Seu acesso ao Portal KBOS",
    `<p>Olá! Clique para entrar no portal:</p><p><a href="${link}">${link}</a></p><p>Vale por 15 minutos.</p>`
  );
  return { sent, devLink: process.env.NODE_ENV === "production" ? null : link, user };
}

export async function consumeMagicLink(token: string) {
  const d = db();
  const row = (
    await d.select().from(loginTokens).where(eq(loginTokens.tokenHash, hashToken(token))).limit(1)
  )[0];
  if (!row || row.consumed || row.expiresAt.getTime() < Date.now()) return null;
  await d.update(loginTokens).set({ consumed: true }).where(eq(loginTokens.id, row.id));
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
  try {
    const { eq: eq2 } = await import("drizzle-orm");
    await db().delete(sessions).where(eq2(sessions.id, sessionId));
  } catch {
    /* sessão já inválida */
  }
}
