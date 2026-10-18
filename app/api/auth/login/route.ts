import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/kbos/auth";
import { SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from "@/lib/kbos/rbac";
import { authLoginSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";

// Login padrão e-mail + senha (fluxo principal do /entrar).
// Admin: a senha pode ser o bypass (`KBOS_ADMIN_BYPASS_TOKEN`/
// `KBOS_ADMIN_PASSWORD`) para acesso imediato na VPS.
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "auth:request");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, authLoginSchema);
    if ("error" in parsed) return parsed.error;
    const { email, password } = parsed.data;
    const r = await loginWithPassword(email, password);
    if (!r.ok) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }
    const dest = r.user.role === "admin" ? "/admin" : "/portal";
    const res = NextResponse.json({ ok: true, dest, adminBypass: r.adminBypass });
    res.cookies.set(SESSION_COOKIE, r.sessionId, sessionCookieOptions(SESSION_DAYS * 86_400));
    return res;
  } catch (e) {
    return serverError(e);
  }
}
