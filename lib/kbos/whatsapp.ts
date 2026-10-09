// Camada de notificações (Módulo 4/6).
//
// O request HTTP SÓ enfileira (Redis + espelho Postgres) — o envio real à
// Evolution API acontece no worker (`worker/index.ts` → `job-handlers.ts`).
// Sem Redis, o job fica `pendente` no banco e o sweeper reenfileira depois.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { notifications, projects, users } from "./schema";
import { buildIdempotencyKey, enqueueJob } from "./jobs";

export type WhatsappPayload = {
  notificationId: string;
  destino: string;
  mensagem: string;
  evento?: string;
};

/** Envio real à Evolution API — roda SÓ no worker (pode lançar erro p/ retry). */
export async function sendEvolutionText(destino: string, mensagem: string) {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!base || !key || !instance) {
    const err = new Error("Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE).");
    (err as NodeJS.ErrnoException).code = "EVOLUTION_MISCONFIGURED";
    throw err;
  }
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ number: destino, text: mensagem }),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text()}`);
}

export async function queueWhatsApp(destino: string, mensagem: string, evento?: string) {
  const d = db();
  const rows = await d
    .insert(notifications)
    .values({ canal: "whatsapp", destino, mensagem, evento })
    .returning({ id: notifications.id });
  const id = rows[0].id;

  const payload: WhatsappPayload = { notificationId: id, destino, mensagem, evento };
  const key = buildIdempotencyKey("notify.whatsapp", {
    destino,
    mensagem,
    evento: evento ?? null,
  });
  const r = await enqueueJob("notify.whatsapp", payload, { key });
  return { queued: r.queued, id, jobId: r.jobId, sent: false, deduped: r.deduped, via: r.via };
}

/** Dispara (sem nunca quebrar a operação principal) para o cliente do projeto. */
export async function notifyProject(projectId: string, evento: string, mensagem: string) {
  try {
    const d = db();
    const proj = (await d.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
    if (!proj?.clienteId) return null;
    const cli = (await d.select().from(users).where(eq(users.id, proj.clienteId)).limit(1))[0];
    if (!cli?.phone) return null;
    return await queueWhatsApp(cli.phone, `*KBOS — ${proj.titulo}*\n${mensagem}`, evento);
  } catch (e) {
    console.error("[KBOS whatsapp]", e);
    return null;
  }
}
