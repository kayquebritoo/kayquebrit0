// Rate limiting (janela fixa, atômico via Lua, contado no Redis).
// Sem Redis → fail-open com aviso (disponibilidade primeiro; ver comentário).
import { NextResponse } from "next/server";
import type IORedis from "ioredis";
import { getRedis, ensureRedis } from "./jobs";

const WINDOW_MS = Math.max(1000, Number(process.env.RATE_WINDOW_MS || 60_000) || 60_000);

function num(env: string | undefined, fallback: number) {
  const n = Number(env);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const POLICIES: Record<string, { limit: number; windowMs: number }> = {
  "auth:request": { limit: num(process.env.RATE_AUTH_MIN, 5), windowMs: WINDOW_MS },
  "auth:verify": { limit: num(process.env.RATE_VERIFY_MIN, 30), windowMs: WINDOW_MS },
  "briefings:create": { limit: num(process.env.RATE_BRIEFING_MIN, 10), windowMs: WINDOW_MS },
  "webhooks:mp": { limit: num(process.env.RATE_WEBHOOK_MIN, 60), windowMs: WINDOW_MS },
  "webhooks:wa": { limit: num(process.env.RATE_WEBHOOK_MIN, 60), windowMs: WINDOW_MS },
};

const LUA = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}`;

export type RateState = { allowed: boolean; count: number; remaining: number; resetMs: number };

export async function hitRateLimit(
  redis: IORedis,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateState> {
  const [count, ttl] = (await redis.eval(LUA, 1, key, String(windowMs))) as [number, number];
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    resetMs: Math.max(0, ttl),
  };
}

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64) || "unknown";
  return (req.headers.get("x-real-ip") || "").slice(0, 64) || "unknown";
}

function limitedResponse(limit: number, state: RateState) {
  const retryS = Math.max(1, Math.ceil(state.resetMs / 1000));
  return NextResponse.json(
    { error: `Muitas requisições. Tente novamente em ${retryS}s.` },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryS),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(state.remaining),
        "X-RateLimit-Reset": String(Date.now() + state.resetMs),
      },
    }
  );
}

/**
 * Retorna `Response 429` quando o escopo estourou, senão `null` (segue o
 * padrão `deny()` do rbac). Falha ABERTO sem Redis: o funil público e o
 * login não podem cair junto com o cache — o evento vai para o log.
 */
export async function withRateLimit(req: Request, scope: keyof typeof POLICIES) {
  const { limit, windowMs } = POLICIES[scope];
  const key = `rl:${scope}:${clientIp(req)}`;
  try {
    // Aguarda o handshake (cold start) antes de decidir — sem isso, o
    // primeiro request após boot cairia no fail-open mesmo com Redis ok.
    if (!(await ensureRedis(1000))) throw new Error("redis indisponível");
    const state = await hitRateLimit(getRedis(), key, limit, windowMs);
    if (!state.allowed) return limitedResponse(limit, state);
    return null;
  } catch (e) {
    console.warn(`[KBOS ratelimit] Redis fora (fail-open ${scope}):`, e instanceof Error ? e.message : e);
    return null;
  }
}
