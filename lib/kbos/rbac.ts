// Sessão + RBAC do KBOS (sessões opacas em cookie httpOnly).
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./schema";
import type { Role } from "./schema";
import {
  ADMIN_EMAIL,
  SESSION_COOKIE_ALIASES,
  SESSION_COOKIE_NAME,
  isAdminBypass,
  isUuidLike,
} from "./admin-access";

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
/** Cookie alternativo aceito na leitura (compat VPS: `kbos.session-token`). */
export { SESSION_COOKIE_ALIASES };
export const SESSION_DAYS = 30;

export { ROLE_LABELS, PIPELINE } from "./constants";

export type SessionUser = typeof users.$inferSelect;

/** Lê o cookie de sessão aceitando o nome principal e o alternativo. */
async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_ALIASES) {
    const v = jar.get(name)?.value?.trim();
    if (v) return v;
  }
  return null;
}

/**
 * Resolve o usuário admin do bypass SEM tocar no banco quando possível.
 * Tenta o banco primeiro (para dados reais); se indisponível, retorna um
 * usuário sintético com role admin — suficiente para liberar `/admin/*`.
 */
async function adminBypassUser(): Promise<SessionUser> {
  try {
    const rows = await db()
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL))
      .limit(1);
    const found = rows[0];
    if (found) {
      // Garante role admin mesmo se a linha foi criada antes como cliente.
      if (found.role !== "admin") {
        const updated = await db()
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, found.id))
          .returning();
        return updated[0] ?? { ...found, role: "admin" as Role };
      }
      return found;
    }
  } catch {
    /* banco inacessível — cai para o sintético abaixo */
  }
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: ADMIN_EMAIL,
    name: "Administrador",
    role: "admin" as Role,
    phone: null,
    createdAt: new Date(0),
  };
}

export async function sessionUser(): Promise<SessionUser | null> {
  try {
    const sid = await readSessionCookie();
    if (!sid) return null;
    // 1) Bypass do admin: comparado em memória, antes de qualquer query.
    //    (O token não é uuid — nunca deve chegar ao Postgres.)
    if (isAdminBypass(sid)) return adminBypassUser();
    // 2) Sessões opacas são uuids: qualquer outro formato é inválido.
    //    Sem este guard, o Postgres lança `invalid input syntax for type uuid`
    //    e a validação de sessão falha com 500 em vez de 401.
    if (!isUuidLike(sid)) return null;
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
