// Lógica do worker (importável sem efeitos colaterais — o boot fica em index.ts).
import IORedis from "ioredis";
import { Queue, UnrecoverableError, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "../lib/kbos/db";
import { jobs } from "../lib/kbos/schema";
import {
  calcBackoffDelay,
  dueDbJobs,
  jobAddOpts,
  jobBaseDelayMs,
  markJobActive,
  type JobType,
} from "../lib/kbos/jobs";
import {
  auditJobDead,
  handleBillingReconcile,
  handleBriefingFollowup,
  handleLmsWelcome,
  handleNotifyWhatsapp,
} from "../lib/kbos/job-handlers";
import type { WhatsappPayload } from "../lib/kbos/whatsapp";

export const newConn = (url: string) =>
  new IORedis(url, { maxRetriesPerRequest: null });

export async function processJob(job: Pick<Job, "id" | "name" | "data" | "updateData">) {
  try {
    const tipo = job.name as JobType;
    switch (tipo) {
      case "notify.whatsapp":
        return await handleNotifyWhatsapp(job.data as WhatsappPayload);
    case "billing.reconcile":
      return await handleBillingReconcile();
    case "briefing.followup":
      return await handleBriefingFollowup();
    case "lms.welcome":
      return await handleLmsWelcome(job.data as { enrollmentId: string });
      default:
        throw new UnrecoverableError(`Tipo de job desconhecido: ${String(tipo)}`);
    }
  } catch (e) {
    // Irrecuperável: marca `morto` na hora (o evento `failed` pula via _dead).
    if (e instanceof UnrecoverableError && job.id) {
      const reason = e.message;
      try {
        await job.updateData({ ...((job.data as object) ?? {}), _dead: true });
      } catch {
        /* segue p/ auditoria direta */
      }
      await auditJobDead(job.id, reason);
    }
    throw e;
  }
}

export async function ensureCrons(queue: Queue, everyMs: number) {
  const existing = await queue.getJobSchedulers();
  const has = (id: string) => existing.some((j) => j.id === id);
  if (!has("cron--billing.reconcile")) {
    await queue.upsertJobScheduler(
      "cron--billing.reconcile",
      { every: everyMs },
      { name: "billing.reconcile", data: {} }
    );
  }
  if (!has("cron--briefing.followup")) {
    await queue.upsertJobScheduler(
      "cron--briefing.followup",
      { every: everyMs },
      { name: "briefing.followup", data: {} }
    );
  }
}

/** Resgata do Postgres o que não chegou ao Redis (queda do Redis no enqueue). */
export async function sweep(queue: Queue) {
  let rows;
  try {
    rows = await dueDbJobs(100);
  } catch {
    return; // banco indisponível — próxima varredura tenta de novo
  }
  for (const r of rows) {
    try {
      await queue.add(r.tipo as JobType, r.payload as Record<string, unknown>, {
        ...jobAddOpts(),
        jobId: r.idempotencyKey,
      });
      await markJobActive(r.idempotencyKey, r.idempotencyKey);
    } catch {
      // Redis ainda fora: adia com backoff para não girar em falso.
      try {
        await db()
          .update(jobs)
          .set({
            proximaTentativa: new Date(Date.now() + calcBackoffDelay(1, jobBaseDelayMs())),
          })
          .where(eq(jobs.idempotencyKey, r.idempotencyKey));
      } catch {
        /* banco caiu junto — próxima varredura tenta de novo */
      }
    }
  }
}
