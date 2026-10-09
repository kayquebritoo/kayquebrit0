import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/kbos/rbac";

// Barreira leve: exige cookie de sessão. A validade do token e o nível
// de acesso (role) são verificados dentro de cada rota/layout.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // health é público (Docker HEALTHCHECK / monitores de uptime).
  // (com trailingSlash, o Next redireciona /api/health -> /api/health/)
  if (pathname === "/api/health" || pathname === "/api/health/") return NextResponse.next();
  const needsAuth =
    pathname.startsWith("/portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/tasks") ||
    pathname.startsWith("/api/time") ||
    pathname.startsWith("/api/transactions") ||
    pathname.startsWith("/api/briefings");
  if (!needsAuth) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/api/:path*"],
};
