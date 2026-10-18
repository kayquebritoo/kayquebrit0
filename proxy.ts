import { NextResponse, type NextRequest } from "next/server";
// NOTA: importar SOMENTE de `admin-access` (módulo edge-safe, sem
// `next/headers`/drizzle/db). Importar `rbac` aqui puxaria o cliente do banco
// para o proxy (barreira de rede) e acoplaria o banco a cada request.
import { SESSION_COOKIE_ALIASES, isAdminBypass, isAdminBypassOpen } from "@/lib/kbos/admin-access";

// Barreira leve: exige cookie de sessão. A validade do token e o nível
// de acesso (role) são verificados dentro de cada rota/layout.
//
// Bypass do admin (produção/VPS): quando `KBOS_ADMIN_BYPASS_TOKEN` está
// configurado e o cookie de sessão contém exatamente esse segredo, o
// proxy libera o acesso — inclusive às rotas `/admin/*` — sem redirect
// para `/entrar`. O `sessionUser()` (rbac) resolve o mesmo token para o
// usuário `contato@kayquebrito.com.br` com role admin, então guards
// client-side e `deny()` nas rotas seguem autorizando. Sem o segredo
// configurado, o bypass fica inativo (fail-closed).
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Bypass aberto da VPS (`KBOS_BYPASS_ADMIN="true"`): acesso livre e direto,
  // sem redirect para `/entrar` e sem exigir sessão/token. Ver o aviso de
  // segurança em `isAdminBypassOpen` (admin-access.ts).
  if (isAdminBypassOpen()) return NextResponse.next();
  // health é público (Docker HEALTHCHECK / monitores de uptime).
  // (com trailingSlash, o Next redireciona /api/health -> /api/health/)
  // `/live` é a liveness pura (sempre 200); `/api/health` é o diagnóstico
  // profundo (503 quando db/redis caem — só para readiness, nunca p/ Docker).
  if (
    pathname === "/api/health" ||
    pathname === "/api/health/" ||
    pathname === "/api/health/live" ||
    pathname === "/api/health/live/"
  )
    return NextResponse.next();
  // Funil público do briefing (sem cookie de sessão):
  // - POST /api/briefings (form de orçamento — conversão principal do site)
  // - GET /api/briefings/[uuid] e .../contrato (links por capacidade pós-envio)
  // Lista (GET /api/briefings) e PATCH seguem exigindo sessão + role na rota.
  const path = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const isBriefingCreate = path === "/api/briefings" && req.method === "POST";
  const isBriefingPublicRead =
    req.method === "GET" && /^\/api\/briefings\/[^/]+(\/contrato)?$/.test(path);
  if (isBriefingCreate || isBriefingPublicRead) return NextResponse.next();
  // Catálogo público do LMS (vitrine de cursos); o conteúdo das aulas
  // segue gated na rota (só matriculados/equipe veem vídeo e texto).
  const isLmsCatalog =
    req.method === "GET" && /^\/api\/lms\/courses(\/[^/]+)?$/.test(path);
  if (isLmsCatalog) return NextResponse.next();
  // Verificação pública de certificado (terceiros validam autenticidade).
  const isCertVerify =
    req.method === "GET" && /^\/api\/lms\/certificates\/verify\/?$/.test(path);
  if (isCertVerify) return NextResponse.next();
  const needsAuth =
    pathname.startsWith("/portal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/plans") ||
    pathname.startsWith("/api/tasks") ||
    pathname.startsWith("/api/time") ||
    pathname.startsWith("/api/transactions") ||
    pathname.startsWith("/api/contacts") ||
    pathname.startsWith("/api/deals") ||
    pathname.startsWith("/api/courses") ||
    pathname.startsWith("/api/conversations") ||
    pathname.startsWith("/api/campaigns") ||
    pathname.startsWith("/api/channels") ||
    pathname.startsWith("/api/finance") ||
    pathname.startsWith("/api/events") ||
    pathname.startsWith("/api/ai") ||
    pathname.startsWith("/api/briefings") ||
    pathname.startsWith("/api/budgets") ||
    pathname.startsWith("/api/lms") ||
    // `/api/admin/deploy` usa Bearer próprio (CI), sem cookie — fica de fora.
    pathname.startsWith("/api/admin/whatsapp");
  if (!needsAuth) return NextResponse.next();
  // Aceita o cookie principal (`kbos_session`) e o alternativo
  // (`kbos.session-token`, convenção usada no deploy da VPS).
  let sessionValue: string | undefined;
  for (const name of SESSION_COOKIE_ALIASES) {
    const v = req.cookies.get(name)?.value;
    if (v) {
      sessionValue = v;
      break;
    }
  }
  // Bypass do admin: token fixo via cookie libera tudo (compara em tempo
  // constante; inativo sem `KBOS_ADMIN_BYPASS_TOKEN` — ver admin-access.ts).
  if (sessionValue && isAdminBypass(sessionValue)) return NextResponse.next();
  if (!sessionValue) {
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
