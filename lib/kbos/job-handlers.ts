// Handlers executados PELO WORKER (nunca no request HTTP).
// Regra: sucesso = resolve; falha transitória = throw (BullMQ faz retry com
// backoff); falha definitiva = UnrecoverableError (vai direto p/ DLQ).
import { and, eq, gte, lte, lt, sql } from "drizzle-orm";
import { UnrecoverableError } from "bullmq";
import { db } from "./db";
import { briefings, campaignLogs, campaigns, contacts, courses, enrollments, events, jobs, notifications, projects, transactions, users } from "./schema";
import { buildIdempotencyKey, enqueueJob, jobAttempts } from "./jobs";
import { welcomeMessage } from "./lms";
import { queueWhatsApp, sendEvolutionText, type WhatsappPayload } from "./whatsapp";
import { mailable, renderTemplate, sendDelayMs, staggeredDelayMs, targetStatuses } from "./campaigns";
import { onlyDigits } from "./inbox";
import { dueReminders, reminderMessage } from "./agenda";
import { ADMIN_EMAIL } from "./admin-access";

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

/* ---------- campaign.dispatch / campaign.send (Fase 3) ---------- */

export type CampaignDispatchPayload = { campaignId: string };
export type CampaignSendPayload = { campaignId: string; logId: string };

async function bumpCampaign(campaignId: string, field: "sentCount" | "failedCount") {
  await db()
    .update(campaigns)
    .set(field === "sentCount" ? { sentCount: sql`${campaigns.sentCount} + 1` } : { failedCount: sql`${campaigns.failedCount} + 1` })
    .where(eq(campaigns.id, campaignId));
}

/** Fecha a campanha quando não resta log `pending` (idempotente). */
export async function finalizeCampaign(campaignId: string) {
  const d = db();
  const pending = await d
    .select({ id: campaignLogs.id })
    .from(campaignLogs)
    .where(and(eq(campaignLogs.campaignId, campaignId), eq(campaignLogs.status, "pending")))
    .limit(1);
  if (pending.length > 0) return { done: false as const };
  const camp = (await d.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1))[0];
  if (!camp || camp.status === "completed" || camp.status === "failed") return { done: true as const };
  const status = (camp.sentCount ?? 0) > 0 ? "completed" : "failed";
  await d.update(campaigns).set({ status }).where(eq(campaigns.id, campaignId));
  return { done: true as const, status };
}

async function failLog(logId: string, campaignId: string, error: string) {
  await db()
    .update(campaignLogs)
    .set({ status: "failed", errorMessage: error.slice(0, 500), sentAt: new Date() })
    .where(eq(campaignLogs.id, logId));
  await bumpCampaign(campaignId, "failedCount");
  await finalizeCampaign(campaignId);
}

/**
 * Fan-out: monta o público, cria os logs `pending` (bulk, em chunks) e
 * enfileira um `campaign.send` por destinatário com delay escalonado
 * (pacing anti-banimento). Replay seguro: se os logs já existem, reutiliza
 * os `pending` em vez de duplicar.
 */
export async function handleCampaignDispatch(p: CampaignDispatchPayload) {
  const d = db();
  const camp = (await d.select().from(campaigns).where(eq(campaigns.id, p.campaignId)).limit(1))[0];
  if (!camp) throw new UnrecoverableError("Campanha não encontrada.");
  if (camp.status === "completed" || camp.status === "failed") return { skipped: true };

  const existing = await d
    .select()
    .from(campaignLogs)
    .where(eq(campaignLogs.campaignId, camp.id));
  let pending = existing.filter((l) => l.status === "pending");

  if (existing.length === 0) {
    // Lista do CRM filtrada em JS (target `all` + telefone discável).
    // Sem paginação: campanhas operam na base toda do CRM (limite 5000).
    const targets = await d.select().from(contacts).limit(5000);
    const wanted = targetStatuses(camp.targetStatus || "all");
    const mailableTargets = targets.filter(
      (c) => wanted.includes(c.status as "lead") && mailable(c.phone)
    );
    if (mailableTargets.length === 0) {
      await d.update(campaigns).set({ status: "failed", totalRecipients: 0 }).where(eq(campaigns.id, camp.id));
      return { targets: 0, note: "sem destinatários discáveis" };
    }
    const chunks: (typeof mailableTargets)[] = [];
    for (let i = 0; i < mailableTargets.length; i += 500) chunks.push(mailableTargets.slice(i, i + 500));
    const created: { id: string }[] = [];
    for (const ch of chunks) {
      const rows = await d
        .insert(campaignLogs)
        .values(ch.map((c) => ({ campaignId: camp.id, contactId: c.id, status: "pending" as const })))
        .returning({ id: campaignLogs.id });
      created.push(...rows);
    }
    await d
      .update(campaigns)
      .set({ status: "running", totalRecipients: created.length })
      .where(eq(campaigns.id, camp.id));
    // Recarrega p/ fan-out com os ids reais (ordem estável de criação).
    const fresh = await d.select().from(campaignLogs).where(eq(campaignLogs.campaignId, camp.id));
    pending = fresh.filter((l) => l.status === "pending");
  } else {
    await d.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, camp.id));
  }

  const base = sendDelayMs();
  let enqueued = 0;
  for (let i = 0; i < pending.length; i++) {
    const log = pending[i];
    const r = await enqueueJob(
      "campaign.send",
      { campaignId: camp.id, logId: log.id },
      {
        key: buildIdempotencyKey("campaign.send", { campaign: camp.id, log: log.id }),
        delayMs: staggeredDelayMs(i, base),
      }
    );
    if (r.queued) enqueued++;
  }
  return { targets: pending.length, enqueued };
}

/**
 * Envio individual com retry: transitório = throw (log segue `pending`);
 * na última tentativa, marca `failed` antes de lançar (a campanha finaliza).
 * Sem telefone ou campanha inativa = falha definitiva sem retry.
 */
export async function handleCampaignSend(
  p: CampaignSendPayload,
  meta?: { attempt: number; max: number }
) {
  const d = db();
  const attempt = meta?.attempt ?? 1;
  const max = meta?.max ?? jobAttempts();
  const log = (await d.select().from(campaignLogs).where(eq(campaignLogs.id, p.logId)).limit(1))[0];
  if (!log) throw new UnrecoverableError("Log de campanha inexistente.");
  if (log.status !== "pending") return { skipped: true };

  const camp = (await d.select().from(campaigns).where(eq(campaigns.id, p.campaignId)).limit(1))[0];
  if (!camp) throw new UnrecoverableError("Campanha inexistente.");
  if (camp.status !== "running") {
    await failLog(log.id, camp.id, "Campanha fora de execução.");
    throw new UnrecoverableError("Campanha fora de execução.");
  }
  const contact = log.contactId
    ? (await d.select().from(contacts).where(eq(contacts.id, log.contactId)).limit(1))[0]
    : undefined;
  const digits = onlyDigits(contact?.phone);
  if (!contact || digits.length < 10) {
    await failLog(log.id, camp.id, "Contato sem telefone discável.");
    return { skipped: true, reason: "sem telefone" };
  }

  const text = renderTemplate(camp.messageTemplate, {
    name: contact.name,
    company: contact.company,
    email: contact.email,
    phone: contact.phone,
  });
  try {
    await sendEvolutionText(digits, text);
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    const definitive =
      (e as NodeJS.ErrnoException).code === "EVOLUTION_MISCONFIGURED" || attempt >= max;
    if (!definitive) throw e instanceof Error ? e : new Error(erro);
    await failLog(log.id, camp.id, erro);
    throw new UnrecoverableError(erro);
  }
  await d
    .update(campaignLogs)
    .set({ status: "sent", errorMessage: null, sentAt: new Date() })
    .where(eq(campaignLogs.id, log.id));
  await bumpCampaign(camp.id, "sentCount");
  await finalizeCampaign(camp.id);
  return { sent: true };
}

/* ---------- agenda.reminders (Fase 4: alertas inteligentes) ---------- */

export function reminderCatchupMin(): number {
  const n = Number(process.env.REMINDER_CATCHUP_MIN || 60);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 60;
}

/**
 * Destinatário dos lembretes: `REMINDER_WHATSAPP_TO` ou o telefone do admin
 * no banco. Null = sem para onde enviar (o job pula sem marcar nada).
 */
export async function resolveReminderPhone(): Promise<string | null> {
  const env = onlyDigits(process.env.REMINDER_WHATSAPP_TO || "");
  if (env.length >= 10) return env;
  try {
    const admin = (
      await db().select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)
    )[0];
    const digits = onlyDigits(admin?.phone);
    return digits.length >= 10 ? digits : null;
  } catch {
    return null;
  }
}

/**
 * Varredura de alertas: reivindica atomicamente (`notification_sent=false` →
 * true por linha, então réplicas/novas tentativas nunca duplicam) e enfileira
 * o WhatsApp via `queueWhatsApp` (o envio real segue no `notify.whatsapp`).
 * Falha no enqueue = devolve o claim p/ a próxima varredura.
 */
export async function handleAgendaReminders(now: Date = new Date()) {
  const d = db();
  const catchup = reminderCatchupMin();
  const horizon = new Date(now.getTime() + 8 * 24 * 3_600_000); // cobre "1 dia antes"
  const floor = new Date(now.getTime() - Math.max(0, catchup) * 60_000);
  const candidates = await d
    .select()
    .from(events)
    .where(
      and(
        eq(events.notificationSent, false),
        gte(events.startTime, floor),
        lte(events.startTime, horizon)
      )
    )
    .limit(200);
  const due = dueReminders(candidates, now, catchup);
  if (due.length === 0) return { checked: candidates.length, due: 0, sent: 0 };

  const phone = await resolveReminderPhone();
  if (!phone) return { checked: candidates.length, due: due.length, sent: 0, skipped: "sem destinatário" };

  let sent = 0;
  let errors = 0;
  for (const ev of due) {
    // Claim atômico: só quem virar o flag de false→true envia.
    const claimed = await d
      .update(events)
      .set({ notificationSent: true, reminderSentAt: now })
      .where(and(eq(events.id, ev.id), eq(events.notificationSent, false)))
      .returning({ id: events.id });
    if (claimed.length === 0) continue; // outra réplica já pegou
    try {
      await queueWhatsApp(phone, reminderMessage(ev), "agenda.reminder");
      sent++;
    } catch (e) {
      errors++;
      try {
        await d
          .update(events)
          .set({ notificationSent: false, reminderSentAt: null })
          .where(eq(events.id, ev.id));
      } catch {
        /* próxima varredura tenta de novo */
      }
    }
  }
  return { checked: candidates.length, due: due.length, sent, errors };
}

/* ---------- auditoria da fila (atualizada pelos eventos do worker) ---------- */
export async function auditJobDone(idempotencyKey: string) {
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
