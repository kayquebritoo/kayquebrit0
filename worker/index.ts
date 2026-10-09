// KBOS Worker — boot: consumers BullMQ + crons + sweeper + heartbeat.
//
//   npm run worker
//
// Consome a fila `kbos`: notify.whatsapp (Evolution), billing.reconcile e
// briefing.followup (crons horários). O sweeper resgata jobs que ficaram
// `pendente` no Postgres enquanto o Redis estava fora. Heartbeat em
// `kbos:worker:heartbeat` alimenta o /api/health.
import { Queue, QueueEvents, Worker } from "bullmq";
import { db } from "../lib/kbos/db";
import {
  HEARTBEAT_KEY,
  HEARTBEAT_TTL_S,
  QUEUE_NAME,
  getRedis,
  redisUrl,
} from "../lib/kbos/jobs";
import { auditJobDone, auditJobFailed } from "../lib/kbos/job-handlers";
import { ensureCrons, newConn, processJob, sweep } from "./runner";

const log = (...a: unknown[]) =>
  console.log(`[worker ${new Date().toISOString()}]`, ...a);

const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 5) || 5);
const SWEEP_MS = Math.max(10_000, Number(process.env.WORKER_SWEEP_MS || 30_000) || 30_000);
const CRON_MS = Number(process.env.WORKER_CRON_MS || 3_600_000) || 3_600_000;

async function main() {
  log(`subindo (concurrency=${CONCURRENCY}, sweep=${SWEEP_MS}ms, cron=${CRON_MS}ms)…`);
  const queue = new Queue(QUEUE_NAME, { connection: newConn(redisUrl()) });
  const worker = new Worker(QUEUE_NAME, (job) => processJob(job), {
    connection: newConn(redisUrl()),
    concurrency: CONCURRENCY,
  });
  const events = new QueueEvents(QUEUE_NAME, { connection: newConn(redisUrl()) });

  worker.on("completed", (job) => log("ok", job.name, job.id));
  worker.on("failed", (job, err) =>
    log("falha", job?.name, job?.id, "tentativa", job?.attemptsMade, "-", err.message)
  );
  worker.on("error", (err) => log("erro:", err.message));

  events.on("completed", ({ jobId }) => {
    void auditJobDone(jobId);
  });
  events.on("failed", async ({ jobId, failedReason }) => {
    try {
      const j = await queue.getJob(jobId);
      if ((j?.data as { _dead?: boolean } | undefined)?._dead) return; // já auditado
      const max = j?.opts.attempts ?? 1;
      const made = j?.attemptsMade ?? 1;
      await auditJobFailed(jobId, made, max, failedReason, made >= max);
    } catch {
      /* auditoria best-effort */
    }
  });

  await ensureCrons(queue, CRON_MS);
  await sweep(queue);
  const sweepTimer = setInterval(() => void sweep(queue), SWEEP_MS);

  const hb = getRedis();
  const beat = () => {
    hb.set(HEARTBEAT_KEY, String(Date.now()), "EX", HEARTBEAT_TTL_S).catch(() => {
      /* sem Redis não há fila mesmo */
    });
  };
  beat();
  const hbTimer = setInterval(beat, 10_000);

  const shutdown = async (sig: string) => {
    log(`encerrando (${sig})…`);
    clearInterval(sweepTimer);
    clearInterval(hbTimer);
    await worker.close();
    await events.close();
    await queue.close();
    try {
      getRedis().disconnect();
    } catch {
      /* já fechado */
    }
    // Fecha pool do drizzle/neon se houver (best-effort; neon-http não tem pool).
    try {
      const d = db() as unknown as { end?: () => Promise<void> };
      await d.end?.();
    } catch {
      /* noop */
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  log("pronto.");
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
