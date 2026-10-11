import { NextResponse } from "next/server";
import { createAdminSession, requestMagicLink } from "@/lib/kbos/auth";
import { isAdminBypass, isAdminEmail } from "@/lib/kbos/admin-access";
import { SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from "@/lib/kbos/rbac";
import { authRequestSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "auth:request");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, authRequestSchema);
    if ("error" in parsed) return parsed.error;
    const { email, name, adminBypass } = parsed.data;

    // Fallback do administrador principal (produção/VPS): com o segredo
    // `KBOS_ADMIN_BYPASS_TOKEN`, cria sessão imediata sem depender do
    // disparo de e-mail externo (Resend/SMTP fora do ar não tranca o admin).
    // Fail-closed: segredo ausente ou inválido segue para o Magic Link normal
    // (e, se o segredo foi enviado mas não confere, responde 403 sem
    // distinguir o motivo nem vazar se o e-mail existe).
    if (adminBypass) {
      if (!isAdminEmail(email) || !isAdminBypass(adminBypass)) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      const direct = await createAdminSession(email, adminBypass);
      if (!direct) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      const res = NextResponse.json({ ok: true, adminSession: true });
      res.cookies.set(SESSION_COOKIE, direct.sessionId, sessionCookieOptions(SESSION_DAYS * 86_400));
      return res;
    }

    const r = await requestMagicLink(email, name || undefined);
    return NextResponse.json({
      ok: true,
      emailEnviado: r.sent,
      ...(r.devLink ? { devLink: r.devLink } : {}),
      // Quando o provedor falha para o admin, o client exibe a dica de usar
      // o bypass — o link em si NUNCA volta na resposta em produção.
      ...(!r.sent && r.adminEmail ? { adminFallback: true } : {}),
      ...(!r.sent && r.emailError ? { detalhe: r.emailError } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    const status = msg.includes("DATABASE_URL") ? 503 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
