import { NextResponse } from "next/server";

// GET /api/health/live — liveness pura: 200 sempre que o servidor responde.
// NÃO toca banco/Redis de propósito: é o que o HEALTHCHECK do Docker e o
// Caddy usam para saber se o container está vivo. O diagnóstico profundo
// (db/redis/worker, com 503 quando degradado) vive em /api/health e serve
// para readiness/monitores — nunca para liveness (um transient do Neon não
// pode derrubar o container para `unhealthy`).
export async function GET() {
  return NextResponse.json(
    { ok: true, commit: process.env.GIT_SHA || "local", now: new Date().toISOString() },
    { status: 200 }
  );
}
