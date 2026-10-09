// Cliente da fila KBOS (BullMQ/Redis + espelho em Postgres).
//
// Contrato do request HTTP: NUNCA faz I/O lento aqui — só escreve no Redis
// (com `enableOfflineQueue: false` para falhar rápido) e espelha no Postgres.
// Se o Redis cair, o job fica `pendente` no Postgres e o sweeper do worker
// reenfileira quando o Redis voltar. Nada se perde.
import { createHash } from "crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq, lte } from "drizzle-orm";
import { db } from "./db";
import { jobs } from "./schema";

export const QUEUE_NAME = "kbos";

export const JOB_TYPES = [
  "notify.whatsapp",
  "billing.reconcile",
  "briefing.followup",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const HEARTBEAT_KEY = "kbos:worker:heartbeat";
export const HEARTBEAT_TTL_S = 30;

export function redisUrl() {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

export function jobAttempts() {
  const n = Number(process.env.JOB_MAX_ATTEMPTS || 5);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 5;
}

export function jobBaseDelayMs() {
  const n = Number(process.env.JOB_BASE_DELAY_MS || 5_000);
  return Number.isFinite(n) && n >= 100 ? Math.floor(n) : 5_000;
}

export const JOB_MAX_DELAY_MS = 3_600_000; // teto do backoff: 1h

// JSON estável (chaves ordenadas) — a mesma carga gera sempre a mesma chave.
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function buildIdempotencyKey(tipo: string, parts: unknown) {
  // BullMQ v6 proíbe `:` em IDs customizados → só [a-z0-9-].
  const safe = tipo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const h = createHash("sha256").update(`${tipo}:${stableStringify(parts)}`).digest("hex");
  return `kbos-${safe}-${h.slice(0, 32)}`;
}

// Backoff exponencial determinístico: base, 2x, 4x... com teto de 1h.
export function calcBackoffDelay(attempt: number, baseMs: number) {
  if (attempt < 1) return baseMs;
  return Math.min(baseMs * 2 ** (attempt - 1), JOB_MAX_DELAY_MS);
}

// ---- conexões (singletons preguiçosos; seguro em serverless) ----

let _redis: IORedis | null = null;
export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(redisUrl(), {
      maxRetriesPerRequest: null, // exigido pelo BullMQ
      enableOfflineQueue: false, // falhar rápido (fallback p/ Postgres)
    });
    _redis.on("error", () => {
      /* erros de conexão são esperados com Redis fora — quem chama decide */
    });
  }
  return _redis;
}

/**
 * Aguarda o handshake (até `timeoutMs`) — sem isso, o primeiro comando após
 * boot falharia mesmo com o Redis saudável (`enableOfflineQueue: false`).
 * Retorna false se o Redis estiver realmente fora → fallback p/ Postgres.
 */
export async function ensureRedis(timeoutMs = 1500): Promise<boolean> {
  const r = getRedis();
  // ioredis v6 tipa `status` sem o literal "ready" — comparação via string.
  if ((r.status as string) === "ready") return true;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        r.off("ready", onReady);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("redis timeout"));
      }, timeoutMs);
      r.once("ready", onReady);
    });
  } catch {
    return false;
  }
  return (r.status as string) === "ready";
}

let _queue: Queue | null = null;
export function getQueue(): Queue {  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: jobAttempts(),
        backoff: { type: "exponential", delay: jobBaseDelayMs() },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    _queue.on("error", () => {
      /* idem */
    });
  }
  return _queue;
}

export type EnqueueResult = {
  queued: boolean;
  via: "redis" | "db" | "none";
  deduped?: boolean;
  jobId?: string;
  erro?: string;
};

/**
 * Opts explícitos em TODO `add()` — o BullMQ v6 não mescla
 * `defaultJobOptions` quando opts são passados (virava `attempts: 0`
 * = sem retry). Fonte única da política de retry.
 */
export function jobAddOpts(delayMs?: number) {
  return {
    attempts: jobAttempts(),
    backoff: { type: "exponential", delay: jobBaseDelayMs() } as const,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    delay: delayMs,
  };
}

export async function enqueueJob(
  tipo: JobType,
  payload: Record<string, unknown>,
  opts?: { key?: string; delayMs?: number }
): Promise<EnqueueResult> {
  const key = opts?.key ?? buildIdempotencyKey(tipo, payload);
  const d = db();

  const mark = async (patch: Partial<typeof jobs.$inferInsert>) => {
    try {
      const rows = await d
        .insert(jobs)
        .values({
          tipo,
          payload,
          status: "pendente",
          maxTentativas: jobAttempts(),
          idempotencyKey: key,
          ...patch,
        })
        .onConflictDoNothing({ target: jobs.idempotencyKey })
        .returning({ id: jobs.id });
      if (rows.length === 0) {
        const existing = (
          await d.select().from(jobs).where(eq(jobs.idempotencyKey, key)).limit(1)
        )[0];
        return { deduped: true as const, id: existing?.id };
      }
      return { deduped: false as const, id: rows[0].id };
    } catch {
      return { deduped: false as const, id: undefined };
    }
  };

  try {
    if (!(await ensureRedis())) throw new Error("redis indisponível");
    const job = await getQueue().add(tipo, payload, { ...jobAddOpts(opts?.delayMs), jobId: key });
    const m = await mark({ status: "ativo", bullmqId: String(job.id ?? key) });
    return { queued: true, via: "redis", deduped: m.deduped, jobId: m.id };
  } catch (e) {
    // Redis fora: Postgres segura o job; o sweeper reenfileira depois.
    const m = await mark({
      status: "pendente",
      proximaTentativa: new Date(),
      erro: e instanceof Error ? `redis: ${e.message}` : "redis indisponível",
    });
    if (!m.id) return { queued: false, via: "none", erro: "Fila e banco indisponíveis." };
    return { queued: true, via: "db", deduped: m.deduped, jobId: m.id };
  }
}

/** Jobs `pendente` vencidos (fallback de quando o Redis caiu). */
export async function dueDbJobs(limit = 100) {
  const d = db();
  return d
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pendente"), lte(jobs.proximaTentativa, new Date())))
    .limit(limit);
}

export async function markJobActive(idempotencyKey: string, bullmqId: string) {
  try {
    await db()
      .update(jobs)
      .set({ status: "ativo", bullmqId, erro: null })
      .where(eq(jobs.idempotencyKey, idempotencyKey));
  } catch {
    /* auditoria best-effort */
  }
}
