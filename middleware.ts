import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/kbos/rbac";

// Barreira leve: exige cookie de sessão. A validade do token e o nível
// de acesso (role) são verificados dentro de cada rota/layout.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // health é público (Docker HEALTHCHECK / monitores de uptime).
  // (com trailingSlash, o Next redireciona /api/health -> /api/health/)
  if (pathname === "/api/health" || pathname === "/api/health/") return NextResponse.next();
  // Funil público do briefing (sem cookie de sessão):
  // - POST /api/briefings (form de orçamento — conversão principal do site)
  // - GET /api/briefings/[uuid] e .../contrato (links por capacidade pós-envio)
  // Lista (GET /api/briefings) e PATCH seguem exigindo sessão + role na rota.
  const path = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const isBriefingCreate = path === "/api/briefings" && req.method === "POST";
  const isBriefingPublicRead =
    req.method === "GET" && /^\/api\/briefings\/[^/]+(\/contrato)?$/.test(path);
  if (isBriefingCreate || isBriefingPublicRead) return NextResponse.next();
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
