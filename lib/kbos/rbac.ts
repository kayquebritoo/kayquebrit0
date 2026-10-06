// Sessão + RBAC do KBOS (sessões opacas em cookie httpOnly).
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./schema";
import type { Role } from "./schema";

export const SESSION_COOKIE = "kbos_session";
export const SESSION_DAYS = 30;

export { ROLE_LABELS, PIPELINE } from "./constants";

export type SessionUser = typeof users.$inferSelect;

export async function sessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const sid = jar.get(SESSION_COOKIE)?.value;
    if (!sid) return null;
    const rows = await db()
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sid))
      .limit(1);
    const row = rows[0];
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return row.user;
  } catch {
    return null;
  }
}

/** Resposta 401/403 padronizada p/ Route Handlers. Retorna null quando autorizado. */
export function deny(user: SessionUser | null, ...roles: Role[]) {
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  if (roles.length > 0 && !roles.includes(user.role as Role)) {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }
  return null;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
