import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeMagicLink } from "@/lib/kbos/auth";
import { SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

const body = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/i) });

// POST /api/auth/link — troca o link de acesso (gerado no admin) por sessão. Só POST:
// robôs de prévia (WhatsApp etc.) abrem a página com GET e não gastam o uso único.
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "auth:verify");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const r = await consumeMagicLink(parsed.data.token.toLowerCase());
    if (!r) return NextResponse.json({ error: "Este link já foi usado ou expirou. Peça um novo ao Kayque." }, { status: 400 });
    const res = NextResponse.json({ ok: true, dest: r.user.role === "admin" ? "/admin" : "/portal" });
    res.cookies.set(SESSION_COOKIE, r.sessionId, sessionCookieOptions(SESSION_DAYS * 86_400));
    return res;
  } catch (e) {
    return serverError(e);
  }
}
