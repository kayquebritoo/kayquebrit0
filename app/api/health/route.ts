import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { HEARTBEAT_KEY, HEARTBEAT_TTL_S, ensureRedis, getRedis } from "@/lib/kbos/jobs";

// GET /api/health — público (Docker HEALTHCHECK, uptime monitors).
// db = núcleo; redis = fila; worker = heartbeat (degradado se obsoleto).
export async function GET() {
  const checks: Record<string, { ok: boolean; ms?: number; detail?: string }> = {};

  const t0 = Date.now();
  try {
    await db().execute(sql`SELECT 1`);
    checks.db = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    checks.db = { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  const t1 = Date.now();
  if (!(await ensureRedis(1000))) {
    checks.redis = { ok: false, detail: "Redis indisponível (jobs caem p/ Postgres)" };
  } else {
    try {
      const pong = await getRedis().ping();
      checks.redis = { ok: pong === "PONG", ms: Date.now() - t1 };
    } catch {
      checks.redis = { ok: false, detail: "Redis indisponível (jobs caem p/ Postgres)" };
    }
  }

  try {
    const raw = await getRedis().get(HEARTBEAT_KEY);
    const age = raw ? Date.now() - Number(raw) : Infinity;
    checks.worker =
      Number.isFinite(age) && age < HEARTBEAT_TTL_S * 1000
        ? { ok: true, ms: Math.round(age) }
        : { ok: false, detail: "sem heartbeat recente" };
  } catch {
    checks.worker = { ok: false, detail: "sem Redis p/ ler heartbeat" };
  }

  const ok = checks.db.ok && checks.redis.ok;
  return NextResponse.json(
    { ok, degraded: !checks.worker.ok, checks, now: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
