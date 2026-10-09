import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/kbos/auth";
import { SESSION_COOKIE, sessionCookieOptions, SESSION_DAYS } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export async function GET(req: Request) {
  const limited = await withRateLimit(req, "auth:verify");
  if (limited) return limited;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const next = url.searchParams.get("next") || "/portal";
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
