// Deploy pull-based — segredo compartilhado + chaves do Redis.
//
// O GitHub Actions avisa o commit via POST /api/admin/deploy (Bearer
// `DEPLOY_TOKEN`); a rota grava o SHA em `kbos:deploy:want` e o cron da VPS
// (`deploy.sh --auto`) executa o `git pull` + rebuild. O deploy finalizado é
// registrado em `kbos:deploy:state` (lido pelo GET da mesma rota).
// Sem `DEPLOY_TOKEN` (≥16 chars), toda a rota fica inativa (fail-closed).
import { timingSafeEqual } from "crypto";

export const DEPLOY_WANT_KEY = "kbos:deploy:want";
export const DEPLOY_STATE_KEY = "kbos:deploy:state";
/** Quanto tempo o pedido de deploy vale (o cron consome bem antes). */
export const DEPLOY_WANT_TTL_S = 3600;

export function getDeployToken(): string | null {
  const v = (process.env.DEPLOY_TOKEN || "").trim();
  return v.length >= 16 ? v : null;
}

/** Comparação em tempo constante; false quando o deploy por token está desativado. */
export function isDeployToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const secret = getDeployToken();
  if (!secret) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** SHA completo de commit (o que o GitHub envia em `$GITHUB_SHA`). */
export function isFullSha(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{40}$/i.test(v.trim());
}

/** `Authorization: Bearer <token>` — null quando ausente/malformado. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  return token ? token : null;
}
