// Tela "Hoje" — lógica pura (sem banco): classificação de prazos, montagem
// das demandas (tarefas + dinheiro no mesmo quadro) e o caixa do mês.
// A rota `/api/admin/today` busca as linhas e entrega tudo já agregado,
// para a tela não baixar listas inteiras só para contar.

export type Urgency = "late" | "soon" | "upcoming";

export type DemandKind = "cobranca" | "pagamento" | "entrega" | "proposta" | "tarefa";

export type Demand = {
  id: string;
  kind: DemandKind;
  title: string;
  detail: string | null;
  amount: number | null;
  dueKey: string; // yyyy-mm-dd no fuso do estúdio
  urgency: Urgency;
  daysLate: number; // > 0 só quando atrasado
  href: string;
};

const DAY_MS = 86_400_000;

/** yyyy-mm-dd de uma data no fuso dado (ex.: America/Belem). */
export function dayKey(d: Date | string, tz: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const keyToUtc = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));

/** Diferença em dias corridos entre duas chaves yyyy-mm-dd (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / DAY_MS);
}

/**
 * Atrasado = venceu antes de hoje; "em 48h" = hoje, amanhã ou depois;
 * próximos dias = até 7 dias. Mais longe que isso não entra no quadro.
 */
export function classifyDue(dueKey: string, todayKey: string): { urgency: Urgency; daysLate: number } | null {
  const diff = daysBetween(todayKey, dueKey);
  if (diff < 0) return { urgency: "late", daysLate: -diff };
  if (diff <= 2) return { urgency: "soon", daysLate: 0 };
  if (diff <= 7) return { urgency: "upcoming", daysLate: 0 };
  return null;
}

export type TrxRow = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string | null;
  valor: string | number;
  vencimento: Date | string | null;
  status: "pendente" | "pago" | "vencido";
  createdAt: Date | string;
  /** carteira: "empresa" | "pessoal" (ausente = empresa) */
  scope?: string | null;
};

export type ProjectRow = {
  id: string;
  titulo: string;
  status: string;
  prazo: Date | string | null;
};

export type BudgetRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  validUntil: Date | string | null;
  totalAmount: string | number;
  clientName: string | null;
  clientCompany: string | null;
};

export type TaskRow = {
  id: string;
  titulo: string;
  status: string;
  dueAt: Date | string | null;
  assignee: string | null;
  projectTitle: string | null;
};

const OPEN_PROJECT = new Set(["novo", "briefing", "producao", "revisao"]);
const OPEN_BUDGET = new Set(["draft", "sent"]);

const URGENCY_ORDER: Record<Urgency, number> = { late: 0, soon: 1, upcoming: 2 };

/** Junta cobranças, pagamentos, entregas e propostas num quadro só, por prazo. */
export function buildDemands(
  input: { transactions: TrxRow[]; projects: ProjectRow[]; budgets: BudgetRow[]; tasks?: TaskRow[] },
  todayKey: string,
  tz: string
): Demand[] {
  const out: Demand[] = [];

  for (const t of input.transactions) {
    if (t.status === "pago" || !t.vencimento) continue;
    const k = dayKey(t.vencimento, tz);
    const c = classifyDue(k, todayKey);
    if (!c) continue;
    out.push({
      id: `trx-${t.id}`,
      kind: t.tipo === "entrada" ? "cobranca" : "pagamento",
      title: t.scope === "pessoal" ? `${t.descricao} (pessoal)` : t.descricao,
      detail: t.categoria,
      amount: Number(t.valor) || 0,
      dueKey: k,
      href: "/admin/financeiro",
      ...c,
    });
  }

  for (const p of input.projects) {
    if (!p.prazo || !OPEN_PROJECT.has(p.status)) continue;
    const k = dayKey(p.prazo, tz);
    const c = classifyDue(k, todayKey);
    if (!c) continue;
    out.push({
      id: `prj-${p.id}`,
      kind: "entrega",
      title: p.titulo,
      detail: null,
      amount: null,
      dueKey: k,
      href: "/admin/projetos",
      ...c,
    });
  }

  for (const b of input.budgets) {
    if (!b.validUntil || !OPEN_BUDGET.has(b.status)) continue;
    const k = dayKey(b.validUntil, tz);
    const c = classifyDue(k, todayKey);
    if (!c) continue;
    out.push({
      id: `bud-${b.id}`,
      kind: "proposta",
      title: `${b.code} · ${b.title}`,
      detail: b.clientCompany || b.clientName,
      amount: Number(b.totalAmount) || 0,
      dueKey: k,
      href: "/admin/orcamentos",
      ...c,
    });
  }

  for (const t of input.tasks ?? []) {
    if (t.status === "done" || !t.dueAt) continue;
    const k = dayKey(t.dueAt, tz);
    const c = classifyDue(k, todayKey);
    if (!c) continue;
    out.push({
      id: `tsk-${t.id}`,
      kind: "tarefa",
      title: t.titulo,
      detail: [t.projectTitle, t.assignee].filter(Boolean).join(" · ") || null,
      amount: null,
      dueKey: k,
      href: "/admin/tarefas",
      ...c,
    });
  }

  return out.sort(
    (a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.dueKey.localeCompare(b.dueKey)
  );
}

export type MonthCash = {
  monthKey: string; // yyyy-mm
  income: number;
  expense: number;
  balance: number;
  /** Saldo acumulado dia a dia, do dia 1 até hoje. */
  series: number[];
};

/** Caixa do mês corrente: só o que foi pago, pela data de vencimento (ou criação). */
export function monthCash(transactions: TrxRow[], todayKey: string, tz: string): MonthCash {
  const monthKey = todayKey.slice(0, 7);
  const days = Number(todayKey.slice(8, 10));
  const perDay = new Array<number>(days).fill(0);
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.status !== "pago") continue;
    const k = dayKey(t.vencimento ?? t.createdAt, tz);
    if (k.slice(0, 7) !== monthKey) continue;
    const day = Number(k.slice(8, 10));
    if (day < 1 || day > days) continue;
    const v = Number(t.valor) || 0;
    if (t.tipo === "entrada") income += v;
    else expense += v;
    perDay[day - 1] += t.tipo === "entrada" ? v : -v;
  }
  let acc = 0;
  const series = perDay.map((v) => (acc += v));
  return { monthKey, income, expense, balance: income - expense, series };
}

/** Saudação pela hora local. */
export function greeting(now: Date, tz: string): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now)) % 24;
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
