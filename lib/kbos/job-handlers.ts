// Handlers executados PELO WORKER (nunca no request HTTP).
// Regra: sucesso = resolve; falha transitória = throw (BullMQ faz retry com
// backoff); falha definitiva = UnrecoverableError (vai direto p/ DLQ).
import { and, eq, lt } from "drizzle-orm";
import { UnrecoverableError } from "bullmq";
import { db } from "./db";
import { briefings, courses, enrollments, jobs, notifications, projects, transactions, users } from "./schema";
import { buildIdempotencyKey, enqueueJob } from "./jobs";
import { welcomeMessage } from "./lms";
import { queueWhatsApp, sendEvolutionText, type WhatsappPayload } from "./whatsapp";

export const FOLLOWUP_AFTER_H = Number(process.env.BRIEFING_FOLLOWUP_HOURS || 48);

function isMisconfigured(e: unknown) {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === "EVOLUTION_MISCONFIGURED";
}

/* ---------- notify.whatsapp ---------- */

export async function handleNotifyWhatsapp(p: WhatsappPayload) {
  const d = db();
  try {
    await sendEvolutionText(p.destino, p.mensagem);
    await d
      .update(notifications)
      .set({ status: "enviado", erro: null })
      .where(eq(notifications.id, p.notificationId));
    return { sent: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await d
      .update(notifications)
      .set({ status: "falha", erro })
      .where(eq(notifications.id, p.notificationId));
    if (isMisconfigured(e)) throw new UnrecoverableError(erro);
    throw e instanceof Error ? e : new Error(erro);
  }
}

/* ---------- billing.reconcile ---------- */

export function isOverdue(
  trx: { status: string; vencimento: Date | null },
  now: Date = new Date()
) {
  return trx.status === "pendente" && !!trx.vencimento && trx.vencimento.getTime() < now.getTime();
}

export async function handleBillingReconcile(now: Date = new Date()) {
  const d = db();
  const pendentes = await d
    .select()
    .from(transactions)
    .where(and(eq(transactions.status, "pendente"), lt(transactions.vencimento, now)));
  let marcadas = 0;
  let lembretes = 0;
  for (const t of pendentes) {
    await d.update(transactions).set({ status: "vencido" }).where(eq(transactions.id, t.id));
    marcadas++;
    // Lembrete 1x/dia por transação (chave inclui a data = idempotente).
    if (t.projectId) {
      const proj = (
        await d.select().from(projects).where(eq(projects.id, t.projectId)).limit(1)
      )[0];
      const cli = proj?.clienteId
        ? (await d.select().from(users).where(eq(users.id, proj.clienteId)).limit(1))[0]
        : undefined;
      if (cli?.phone) {
        const dia = now.toISOString().slice(0, 10);
        const r = await enqueueJob(
          "notify.whatsapp",
          {
            destino: cli.phone,
            mensagem:
              `*KBOS — cobrança*\nOlá ${cli.name}! A fatura "${t.descricao}" ` +
              `de R$ ${t.valor} venceu. Responda aqui para regularizar.`,
            evento: "cobranca",
          },
          { key: buildIdempotencyKey("cobranca", { trx: t.id, dia }) }
        );
        if (r.queued && !r.deduped) lembretes++;
      }
    }
  }
  return { marcadas, lembretes };
}

/* ---------- briefing.followup ---------- */

export function isStaleBriefing(
  b: { status: string; createdAt: Date },
  now: Date = new Date(),
  afterH: number = FOLLOWUP_AFTER_H
) {
  return (
    b.status === "novo" && now.getTime() - b.createdAt.getTime() > afterH * 3_600_000
  );
}

export async function handleBriefingFollowup(now: Date = new Date()) {
  const d = db();
  const novos = await d.select().from(briefings).where(eq(briefings.status, "novo"));
  let enviados = 0;
  for (const b of novos) {
    if (!isStaleBriefing(b, now) || !b.clienteTel) continue;
    const r = await enqueueJob(
      "notify.whatsapp",
      {
        destino: b.clienteTel,
        mensagem:
          `*KBOS*\nOlá ${b.clienteNome}! Recebemos seu briefing de ${b.categoria} ` +
          `e estamos preparando sua proposta. Ficou alguma dúvida?`,
        evento: "briefing.followup",
      },
      { key: buildIdempotencyKey("briefing.followup", { briefing: b.id }) }
    );
    if (r.queued && !r.deduped) enviados++;
  }
  return { enviados };
}

/* ---------- lms.welcome ---------- */

export async function handleLmsWelcome(p: { enrollmentId: string }) {
  const d = db();
  const enr = (
    await d.select().from(enrollments).where(eq(enrollments.id, p.enrollmentId)).limit(1)
  )[0];
  if (!enr) throw new UnrecoverableError("Matrícula não encontrada.");
  const aluno = (await d.select().from(users).where(eq(users.id, enr.userId)).limit(1))[0];
  const course = (await d.select().from(courses).where(eq(courses.id, enr.courseId)).limit(1))[0];
  if (!aluno || !course) throw new UnrecoverableError("Aluno ou curso inexistente.");
  // Sem telefone não há para onde enviar — sucesso com skip (não é falha).
  if (!aluno.phone) return { skipped: true, reason: "aluno sem telefone" };
  const r = await queueWhatsApp(aluno.phone, welcomeMessage(aluno.name, course.titulo), "lms.boas-vindas");
  return { skipped: false, queued: r.queued, via: r.via };
}

/* ---------- auditoria da fila (atualizada pelos eventos do worker) ---------- */export async function auditJobDone(idempotencyKey: string) {
  try {
    await db()
      .update(jobs)
      .set({ status: "concluido", erro: null })
      .where(eq(jobs.idempotencyKey, idempotencyKey));
  } catch {
    /* best-effort */
  }
}

export async function auditJobFailed(
  idempotencyKey: string,
  tentativas: number,
  maxTentativas: number,
  erro: string,
  final: boolean
) {
  try {
    await db()
      .update(jobs)
      .set({ status: final ? "falha" : "ativo", tentativas, erro })
      .where(eq(jobs.idempotencyKey, idempotencyKey));
  } catch {
    /* best-effort */
  }
}

export async function auditJobDead(idempotencyKey: string, erro: string) {
  try {
    await db()
      .update(jobs)
      .set({ status: "morto", erro })
      .where(eq(jobs.idempotencyKey, idempotencyKey));
  } catch {
    /* best-effort */
  }
}
