// Integração da fila KBOS — exige Redis + Postgres.
//   npm run test:int            (lê .env.local p/ DATABASE_URL; Redis em REDIS_URL)
// Sem KBOS_TEST_REDIS=1, tudo é pulado. Limpa todas as linhas de teste
// (chaves prefixadas `test:`) ao final de cada caso.
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";

// Carrega .env.local sem nova dependência (só p/ teste local).
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch {
  /* sem .env.local: testes de banco pulam abaixo */
}
// Garante Evolution DESLIGADO p/ testar o caminho de falha irrecuperável.
delete process.env.EVOLUTION_API_URL;
delete process.env.EVOLUTION_API_KEY;
delete process.env.EVOLUTION_INSTANCE;

const RUN = !!process.env.KBOS_TEST_REDIS && !!process.env.DATABASE_URL;

const { db } = await import("../db");
const { jobs } = await import("../schema");
const { dueDbJobs, enqueueJob, getQueue } = await import("../jobs");
const { processJob } = await import("../../../worker/runner");

const tkey = () => `test--${randomUUID()}`;
const createdKeys: string[] = [];

afterEach(async () => {
  if (!RUN) return;
  // Remove os jobs do Redis (senão um worker ativo os executaria depois).
  try {
    const q = getQueue();
    for (const key of createdKeys.splice(0)) {
      try {
        await (await q.getJob(key))?.remove();
      } catch {
        /* já finalizado/removido */
      }
    }
  } catch {
    /* sem Redis no teardown */
  }
  await db().delete(jobs).where(like(jobs.idempotencyKey, "test--%"));
});

const payload = () => ({
  notificationId: randomUUID(),
  destino: "5591999999999",
  mensagem: "ping-teste",
});

describe.skipIf(!RUN)("fila KBOS (redis+db)", () => {
  it("enfileira via redis e espelha `ativo` no Postgres", async () => {
    const key = tkey();
    createdKeys.push(key);
    const r = await enqueueJob("notify.whatsapp", payload(), { key });
    expect(r.queued).toBe(true);
    expect(r.via).toBe("redis");
    const row = (await db().select().from(jobs).where(eq(jobs.idempotencyKey, key)).limit(1))[0];
    expect(row?.status).toBe("ativo");
  });

  it("segundo enqueue da mesma chave = dedup (idempotente)", async () => {
    const key = tkey();
    createdKeys.push(key);
    const p = payload();
    const first = await enqueueJob("notify.whatsapp", p, { key });
    const second = await enqueueJob("notify.whatsapp", p, { key });
    expect(first.deduped).toBe(false);
    expect(second.queued).toBe(true);
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
  });

  it("dueDbJobs ignora jobs já `ativo`", async () => {
    const key = tkey();
    createdKeys.push(key);
    await enqueueJob("notify.whatsapp", payload(), { key });
    const due = await dueDbJobs(100);
    expect(due.some((d) => d.idempotencyKey === key)).toBe(false);
  });

  it("Evolution desligado → UnrecoverableError + auditoria `morto` (DLQ)", async () => {
    const key = tkey();
    createdKeys.push(key);
    await enqueueJob("notify.whatsapp", payload(), { key });
    let data: Record<string, unknown> = {
      notificationId: randomUUID(),
      destino: "5591999999999",
      mensagem: "ping-teste",
    };
    const stub = {
      id: key,
      name: "notify.whatsapp",
      data,
      updateData: async (d: Record<string, unknown>) => {
        data = d;
      },
    };
    await expect(processJob(stub as never)).rejects.toThrow();
    expect((data as { _dead?: boolean })._dead).toBe(true);
    const row = (await db().select().from(jobs).where(eq(jobs.idempotencyKey, key)).limit(1))[0];
    expect(row?.status).toBe("morto");
  });
});
