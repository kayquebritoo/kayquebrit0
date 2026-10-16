import { NextResponse } from "next/server";
import { createAdminSession, setUserPasswordById, setUserPasswordByToken } from "@/lib/kbos/auth";
import { isAdminBypass, isAdminEmail } from "@/lib/kbos/admin-access";
import { sessionUser } from "@/lib/kbos/rbac";
import { authPasswordSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";

// Define/troca senha (bootstrap via Magic Link ou troca logada).
// - Logado: `{ password }` troca direto.
// - Sem sessão: exige `{ token }` (token bruto do Magic Link, prova o e-mail)
//   ou `{ adminBypass }` (somente admin) + e-mail na query? O e-mail vem do
//   token; com bypass, usa o e-mail do admin.
// O Magic Link segue como fallback de recuperação (não mais fluxo exclusivo).
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "auth:request");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, authPasswordSchema);
    if ("error" in parsed) return parsed.error;
    const { password, token, adminBypass } = parsed.data;

    // 1) Troca logada (sessão válida).
    const me = await sessionUser();
    if (me && !token && !adminBypass) {
      const updated = await setUserPasswordById(me.id, password);
      if (!updated) return NextResponse.json({ error: "Falha ao salvar." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // 2) Bypass do admin (acesso imediato na VPS): define a senha do admin
    // sem depender do e-mail externo.
    if (adminBypass) {
      const url = new URL(req.url);
      const email = (url.searchParams.get("email") || "").trim().toLowerCase();
      if (!isAdminEmail(email) || !isAdminBypass(adminBypass)) {
        return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      }
      const direct = await createAdminSession(email, adminBypass);
      if (!direct) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
      await setUserPasswordById(direct.user.id, password);
      return NextResponse.json({ ok: true });
    }

    // 3) Bootstrap via Magic Link (prova posse do e-mail).
    if (token) {
      const url = new URL(req.url);
      const emailHint = (url.searchParams.get("email") || "").trim();
      const updated = await setUserPasswordByToken(emailHint, token, password);
      if (!updated) {
        return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  } catch (e) {
    return serverError(e);
  }
}
