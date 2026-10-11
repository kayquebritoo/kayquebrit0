import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/kbos/auth";
import { SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export async function GET(req: Request) {
  const limited = await withRateLimit(req, "auth:verify");
  if (limited) return limited;
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  const next = url.searchParams.get("next") || "/portal";
  // O bypass do admin NUNCA trafega por URL (evita segredo em logs/histórico):
  // `?token=` aceita somente o formato do Magic Link (hex de 64+ chars).
  // Qualquer outro formato cai em `/entrar?erro=link` sem tocar no banco.
  if (!/^[0-9a-f]{32,128}$/i.test(token)) {
    return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
  }
  try {
    const r = await consumeMagicLink(token);
    if (!r) {
      return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
    }
    const dest = next.startsWith("/") ? next : "/portal";
    const res = NextResponse.redirect(new URL(dest, url.origin));
    res.cookies.set(SESSION_COOKIE, r.sessionId, sessionCookieOptions(SESSION_DAYS * 86_400));
    return res;
  } catch {
    return NextResponse.redirect(new URL("/entrar?erro=link", url.origin));
  }
}
