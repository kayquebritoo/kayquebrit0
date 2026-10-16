import { NextResponse } from "next/server";
import { ensureRedis, getRedis } from "@/lib/kbos/jobs";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";
import {
  DEPLOY_STATE_KEY,
  DEPLOY_WANT_KEY,
  DEPLOY_WANT_TTL_S,
  bearerToken,
  isDeployToken,
  isFullSha,
} from "@/lib/kbos/deploy";

export const dynamic = "force-dynamic";

// Gatilho do deploy pull-based — autenticado por token compartilhado
// (`DEPLOY_TOKEN`, mesmo valor no `/opt/kbos/.env` da VPS e no secret
// `DEPLOY_TOKEN` do GitHub). Sem o segredo configurado, tudo é 401.
//
//   POST /api/admin/deploy  { "sha": "<commit de 40 hex>" } → pede o deploy
//   GET  /api/admin/deploy → estado do último deploy + pedido pendente
//
// O deploy em si roda na VPS (`deploy.sh --auto` no cron a cada ~3 min);
// esta rota só registra a intenção em `kbos:deploy:want` (TTL 1h).
function unauthorized() {
  return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
}

export async function GET(req: Request) {
  const limited = await withRateLimit(req, "admin:deploy");
  if (limited) return limited;
  if (!isDeployToken(bearerToken(req))) return unauthorized();
  if (!(await ensureRedis(1500))) {
    return NextResponse.json({ error: "Redis indisponível." }, { status: 503 });
  }
  try {
    const r = getRedis();
    const [state, want] = await Promise.all([r.get(DEPLOY_STATE_KEY), r.get(DEPLOY_WANT_KEY)]);
    let parsed: unknown = null;
    try {
      parsed = state ? JSON.parse(state) : null;
    } catch {
      parsed = state;
    }
    return NextResponse.json({
      ok: true,
      commit: process.env.GIT_SHA || "local",
      state: parsed,
      want,
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "admin:deploy");
  if (limited) return limited;
  if (!isDeployToken(bearerToken(req))) return unauthorized();
  let sha: unknown;
  try {
    sha = ((await req.json()) as { sha?: unknown }).sha;
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }
  if (!isFullSha(sha)) {
    return NextResponse.json({ error: "Informe `sha` (commit de 40 hex)." }, { status: 400 });
  }
  if (!(await ensureRedis(1500))) {
    return NextResponse.json({ error: "Redis indisponível." }, { status: 503 });
  }
  try {
    await getRedis().set(DEPLOY_WANT_KEY, sha.toLowerCase(), "EX", DEPLOY_WANT_TTL_S);
    return NextResponse.json({ ok: true, want: sha.toLowerCase() });
  } catch (e) {
    return serverError(e);
  }
}
