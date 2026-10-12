// Briefing Matinal Automatizado — varredura + formatação + disparo.
//
// Job `briefing.morning`: roda 1x/dia (cron configurável via
// `BRIEFING_MORNING_CRON`, padrão `0 8 * * *`) e envia ao admin via
// Evolution API o resumo do dia: reuniões, orçamentos travados e cobranças.
//
// Dia de referência: fuso de `BRIEFING_TIMEZONE` (padrão America/Sao_Paulo).
// As queries buscam uma janela larga no banco e o filtro "é hoje?" acontece
// em JS com `Intl` — sem conta manual de offset, sem dependência nova.
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { contacts, deals, events, transactions } from "./schema";
import { queueWhatsApp } from "./whatsapp";
import { resolveReminderPhone } from "./job-handlers";

export const MORNING_DEAL_STAGES = ["proposal", "negotiation"] as const;

export function morningCronPattern(): string {
  const v = (process.env.BRIEFING_MORNING_CRON || "").trim();
  // Aceita cron de 5 campos; qualquer outra coisa cai no padrão 08:00.
  return /^(\S+\s+){4}\S+$/.test(v) ? v : "0 8 * * *";
}

export function briefingTimeZone(): string {
  const v = (process.env.BRIEFING_TIMEZONE || "").trim();
  if (!v) return "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: v });
    return v;
  } catch {
    return "America/Sao_Paulo";
  }
}

/** `2026-10-12` no fuso pedido (comparável como string). */
export function dayKeyInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // YYYY-MM-DD
}

export function isTodayInTZ(d: Date | string, now: Date, tz: string): boolean {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return false;
  return dayKeyInTZ(dt, tz) === dayKeyInTZ(now, tz);
}

export type MorningEvent = {
  title: string;
  startTime: Date;
  location: string | null;
};

export type MorningDeal = {
  title: string;
  stage: string;
  value: string | null;
  contactName: string | null;
};

export type MorningCharge = {
  descricao: string;
  tipo: string;
  valor: string;
  status: string;
  vencimento: Date | null;
};

export type MorningBriefingData = {
  dateLabel: string;
  eventsToday: MorningEvent[];
  waitingQuote: MorningDeal[];
  pendingCharges: MorningCharge[];
};

const brl = (v: string | number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const hhmm = (d: Date) =>
  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const STAGE_LABEL: Record<string, string> = {
  proposal: "proposta",
  negotiation: "negociação",
  prospecting: "prospecção",
};

/** Texto estruturado do WhatsApp ("Briefing Diário KBOS"). Puro — testável sem banco. */
export function formatMorningBriefing(data: MorningBriefingData): string {
  const lines: string[] = [
    `*☀️ Briefing Diário KBOS — ${data.dateLabel}*`,
    "",
  ];
  // 1) Reuniões do dia
  lines.push(`*📅 Reuniões de hoje (${data.eventsToday.length})*`);
  if (data.eventsToday.length === 0) {
    lines.push("— Nenhum compromisso na agenda.");
  } else {
    for (const e of data.eventsToday.slice(0, 15)) {
      const where = (e.location || "").trim();
      lines.push(`• ${hhmm(e.startTime)} — ${e.title}${where ? ` (${where})` : ""}`);
    }
    if (data.eventsToday.length > 15) lines.push(`• …e mais ${data.eventsToday.length - 15}.`);
  }
  lines.push("");
  // 2) Aguardando orçamento / retorno
  lines.push(`*💼 Aguardando orçamento/retorno (${data.waitingQuote.length})*`);
  if (data.waitingQuote.length === 0) {
    lines.push("— Pipeline limpo. Nada travado em proposta/negociação.");
  } else {
    const total = data.waitingQuote.reduce((a, d) => a + Number(d.value || 0), 0);
    for (const d of data.waitingQuote.slice(0, 15)) {
      const stage = STAGE_LABEL[d.stage] ?? d.stage;
      const who = d.contactName ? ` — ${d.contactName}` : "";
      lines.push(`• ${d.title}${who} [${stage}] ${brl(d.value)}`);
    }
    if (data.waitingQuote.length > 15) lines.push(`• …e mais ${data.waitingQuote.length - 15}.`);
    lines.push(`Total em jogo: *${brl(total)}*`);
  }
  lines.push("");
  // 3) Cobranças
  lines.push(`*💰 Cobranças pendentes/vencidas (${data.pendingCharges.length})*`);
  if (data.pendingCharges.length === 0) {
    lines.push("— Nada a cobrar. Caixa em dia.");
  } else {
    const total = data.pendingCharges.reduce((a, t) => a + Number(t.valor || 0), 0);
    for (const t of data.pendingCharges.slice(0, 15)) {
      const tag = t.status === "vencido" ? "🔴 vencido" : "🟡 pendente";
      const sign = t.tipo === "saida" ? " (a pagar)" : "";
      const due = t.vencimento
        ? ` — vence ${t.vencimento.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
        : "";
      lines.push(`• ${t.descricao} — ${brl(t.valor)} [${tag}]${sign}${due}`);
    }
    if (data.pendingCharges.length > 15) lines.push(`• …e mais ${data.pendingCharges.length - 15}.`);
    lines.push(`Total pendente: *${brl(total)}*`);
  }
  lines.push("", "Bom dia e boas vendas! 🚀");
  return lines.join("\n");
}

/** Varredura do banco (eventos de hoje + deals travados + cobranças). */
export async function gatherMorningBriefing(now: Date = new Date()): Promise<MorningBriefingData> {
  const d = db();
  const tz = briefingTimeZone();

  // Janela larga (±48h) + filtro "é hoje?" em JS (fuso do admin).
  const floor = new Date(now.getTime() - 48 * 3_600_000);
  const ceil = new Date(now.getTime() + 48 * 3_600_000);
  const [eventRows, dealRows, trxRows] = await Promise.all([
    d
      .select({
        title: events.title,
        startTime: events.startTime,
        location: events.location,
      })
      .from(events)
      .where(and(gte(events.startTime, floor), lte(events.startTime, ceil)))
      .orderBy(sql`${events.startTime} ASC`)
      .limit(300),
    d
      .select({
        title: deals.title,
        stage: deals.stage,
        value: deals.value,
        contactName: contacts.name,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .where(inArray(deals.stage, [...MORNING_DEAL_STAGES]))
      .limit(200),
    d
      .select({
        descricao: transactions.descricao,
        tipo: transactions.tipo,
        valor: transactions.valor,
        status: transactions.status,
        vencimento: transactions.vencimento,
      })
      .from(transactions)
      .where(inArray(transactions.status, ["pendente", "vencido"]))
      .limit(200),
  ]);

  const eventsToday: MorningEvent[] = eventRows
    .filter((e) => isTodayInTZ(e.startTime, now, tz))
    .map((e) => ({ title: e.title, startTime: e.startTime, location: e.location }));

  return {
    dateLabel: now.toLocaleDateString("pt-BR", {
      timeZone: tz,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    }),
    eventsToday,
    waitingQuote: dealRows.map((r) => ({
      title: r.title,
      stage: r.stage,
      value: r.value,
      contactName: r.contactName,
    })),
    pendingCharges: trxRows.map((r) => ({
      descricao: r.descricao,
      tipo: r.tipo,
      valor: r.valor,
      status: r.status,
      vencimento: r.vencimento,
    })),
  };
}

export type MorningBriefingResult = {
  sent: boolean;
  skipped?: string;
  via?: string;
  preview: string;
  counts: { meetings: number; quotes: number; charges: number };
};

/**
 * Executa o briefing: varre, formata e enfileira o WhatsApp ao admin.
 * `dryRun` = só monta o texto (usado pelo endpoint de teste/preview).
 * Idempotência diária: a chave inclui o dia, então replays no mesmo dia
 * reutilizam o `notify.whatsapp` já enfileirado (sem duplicar o envio).
 */
export async function handleMorningBriefing(
  now: Date = new Date(),
  opts?: { dryRun?: boolean }
): Promise<MorningBriefingResult> {
  const data = await gatherMorningBriefing(now);
  const preview = formatMorningBriefing(data);
  const counts = {
    meetings: data.eventsToday.length,
    quotes: data.waitingQuote.length,
    charges: data.pendingCharges.length,
  };
  if (opts?.dryRun) return { sent: false, skipped: "dry-run", preview, counts };

  const phone = await resolveReminderPhone();
  if (!phone) return { sent: false, skipped: "sem destinatário", preview, counts };

  const r = await queueWhatsApp(phone, preview, "briefing.morning");
  return { sent: r.queued, via: r.via, preview, counts };
}
