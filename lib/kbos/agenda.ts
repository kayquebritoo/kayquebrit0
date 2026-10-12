// Agenda e alertas — Fase 4 (puro, client-safe: sem imports server).
//
// Janela de disparo: o lembrete vence quando
//   `startTime - reminderMinutesBefore <= agora`
// com tolerância p/ eventos que já começaram (`catchupMin`, padrão 60).
// `reminderMinutesBefore = 0` = sem aviso. A dedup real é o flag
// `notification_sent` + reivindicação atômica no worker (ver job-handlers).

export type AgendaEventLike = {
  title: string;
  startTime: string | Date;
  reminderMinutesBefore?: number | null;
  notificationSent?: boolean | null;
  location?: string | null;
};

export function reminderLeadMin(e: Pick<AgendaEventLike, "reminderMinutesBefore">): number {
  const n = Number(e.reminderMinutesBefore ?? 15);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 15;
}

function startMs(e: Pick<AgendaEventLike, "startTime">): number | null {
  const d = e.startTime instanceof Date ? e.startTime : new Date(e.startTime);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** True quando o lembrete deve disparar agora (e ainda não foi enviado). */
export function isReminderDue(
  e: AgendaEventLike,
  now: Date = new Date(),
  catchupMin = 60
): boolean {
  if (e.notificationSent) return false;
  const lead = reminderLeadMin(e);
  if (lead <= 0) return false;
  const start = startMs(e);
  if (start === null) return false;
  const t = now.getTime();
  return start - lead * 60_000 <= t && start >= t - Math.max(0, catchupMin) * 60_000;
}

/** Filtra os devidos (ordem de início) — usado pelo worker e por testes. */
export function dueReminders<T extends AgendaEventLike>(
  list: T[],
  now: Date = new Date(),
  catchupMin = 60
): T[] {
  return list
    .filter((e) => isReminderDue(e, now, catchupMin))
    .sort((a, b) => (startMs(a) ?? 0) - (startMs(b) ?? 0));
}

const dtf = (d: Date) =>
  d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Texto do WhatsApp enviado ao admin. */
export function reminderMessage(e: AgendaEventLike): string {
  const d = e.startTime instanceof Date ? e.startTime : new Date(e.startTime);
  const when = Number.isNaN(d.getTime()) ? "horário indefinido" : dtf(d);
  const where = (e.location || "").trim();
  return (
    `*KBOS — lembrete de agenda*\n📌 ${e.title}\n🕒 ${when}` +
    (where ? `\n📍 ${where}` : "") +
    `\nComeça em ~${reminderLeadMin(e)} min.`
  );
}

/** Selo exibido na UI (ex.: "Aviso via WhatsApp 15 min antes"). */
export function reminderLabel(minutes: number | null | undefined): string {
  const n = reminderLeadMin({ reminderMinutesBefore: minutes });
  return n <= 0 ? "Sem aviso" : `Aviso via WhatsApp ${n} min antes`;
}

/** Opções do seletor de antecedência (minutos). */
export const REMINDER_OPTIONS = [
  { value: 0, label: "Sem aviso" },
  { value: 5, label: "5 min antes" },
  { value: 15, label: "15 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 hora antes" },
  { value: 1440, label: "1 dia antes" },
] as const;
