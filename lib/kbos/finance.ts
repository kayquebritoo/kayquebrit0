// Central Financeira — Fase 4 (puro, client-safe: sem imports server).
//
// A tabela `kbos_transactions` (Fase 0, nomes PT) já cobre o contrato pedido;
// este módulo faz a ponte EN↔PT e os agregados (resumo + fluxo de caixa).
// Contrato público da API `/api/finance`:
export type FinanceType = "income" | "expense";
export type FinanceStatus = "pending" | "paid" | "overdue";

export type FinanceEntry = {
  id: string;
  type: FinanceType;
  description: string;
  amount: number;
  category: string | null;
  dueDate: string | null;
  status: FinanceStatus;
  /** Empresa ou pessoal (0010). */
  scope: FinanceScope;
  paymentMethod: string | null;
  /** null | "mensal" | "anual" — ao marcar pago, nasce a próxima. */
  recurrence: FinanceRecurrence | null;
  contactId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceScope = "empresa" | "pessoal";
export type FinanceRecurrence = "mensal" | "anual";

type DbRow = {
  id: string;
  tipo: string;
  descricao: string;
  categoria: string | null;
  valor: string | number | null;
  vencimento: string | Date | null;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  scope?: string | null;
  paymentMethod?: string | null;
  recurrence?: string | null;
  contactId?: string | null;
  notes?: string | null;
};

const iso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Linha PT do banco → contrato EN da API. `vencido` vira `overdue` (leitura),
 * e pendente com vencimento antes de hoje também (ninguém precisa marcar à mão). */
export function toFinanceEntry(r: DbRow, now = new Date()): FinanceEntry {
  const due = iso(r.vencimento);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lateByDate = r.status === "pendente" && !!due && new Date(due).getTime() < startToday;
  return {
    id: r.id,
    type: r.tipo === "saida" ? "expense" : "income",
    description: r.descricao,
    amount: Number(r.valor || 0) || 0,
    category: r.categoria ?? null,
    dueDate: due,
    status: r.status === "pago" ? "paid" : r.status === "vencido" || lateByDate ? "overdue" : "pending",
    scope: r.scope === "pessoal" ? "pessoal" : "empresa",
    paymentMethod: r.paymentMethod ?? null,
    recurrence: r.recurrence === "mensal" || r.recurrence === "anual" ? r.recurrence : null,
    contactId: r.contactId ?? null,
    notes: r.notes ?? null,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(r.updatedAt) ?? iso(r.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Payload EN da API → colunas PT do banco (escrita). */
export function toDbInsert(b: {
  type: FinanceType;
  description: string;
  amount: string;
  category?: string;
  dueDate?: string;
  status?: "pending" | "paid";
  scope?: FinanceScope;
  paymentMethod?: string;
  recurrence?: FinanceRecurrence | null;
  contactId?: string;
  notes?: string;
}) {
  return {
    scope: b.scope ?? "empresa",
    paymentMethod: b.paymentMethod || null,
    recurrence: b.recurrence ?? null,
    contactId: b.contactId || null,
    notes: b.notes || null,
    tipo: (b.type === "expense" ? "saida" : "entrada") as "entrada" | "saida",
    descricao: b.description,
    categoria: b.category ?? null,
    valor: b.amount,
    vencimento: b.dueDate ? new Date(b.dueDate) : null,
    status: (b.status === "paid" ? "pago" : "pendente") as "pendente" | "pago",
  };
}

export function toDbPatch(b: {
  type?: FinanceType;
  description?: string;
  amount?: string | null;
  category?: string | null;
  dueDate?: string | null;
  status?: "pending" | "paid";
  scope?: FinanceScope;
  paymentMethod?: string | null;
  recurrence?: FinanceRecurrence | null;
  contactId?: string | null;
  notes?: string | null;
}): Record<string, unknown> {
  const p: Record<string, unknown> = { updatedAt: new Date() };
  if (b.scope !== undefined) p.scope = b.scope;
  if (b.paymentMethod !== undefined) p.paymentMethod = b.paymentMethod || null;
  if (b.recurrence !== undefined) p.recurrence = b.recurrence || null;
  if (b.contactId !== undefined) p.contactId = b.contactId || null;
  if (b.notes !== undefined) p.notes = b.notes || null;
  if (b.type !== undefined) p.tipo = b.type === "expense" ? "saida" : "entrada";
  if (b.description !== undefined) p.descricao = b.description;
  if (b.amount !== undefined) p.valor = b.amount;
  if (b.category !== undefined) p.categoria = b.category || null;
  if (b.dueDate !== undefined) p.vencimento = b.dueDate ? new Date(b.dueDate) : null;
  if (b.status !== undefined) p.status = b.status === "paid" ? "pago" : "pendente";
  return p;
}

export type FinanceSummary = {
  income: number;
  expenses: number;
  balance: number;
  receivable: number;
  payable: number;
};

/** Resumo de saldo: pagos compõem receita/despesa; pendente+vencido = a receber/pagar. */
export function summarize(entries: Pick<FinanceEntry, "type" | "amount" | "status">[]): FinanceSummary {
  let income = 0;
  let expenses = 0;
  let receivable = 0;
  let payable = 0;
  for (const e of entries) {
    if (e.status === "paid") {
      if (e.type === "income") income += e.amount;
      else expenses += e.amount;
    } else if (e.type === "income") {
      receivable += e.amount;
    } else {
      payable += e.amount;
    }
  }
  return { income, expenses, balance: income - expenses, receivable, payable };
}

export type CashPoint = { key: string; label: string; income: number; expenses: number };

/** Fluxo de caixa mensal (pagos, por `dueDate` ou `createdAt`) — últimos `n` meses. */
export function cashFlowByMonth(
  entries: Pick<FinanceEntry, "type" | "amount" | "status" | "dueDate" | "createdAt">[],
  n = 6,
  now = new Date()
): CashPoint[] {
  const buckets: CashPoint[] = [];
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({
      key,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      income: 0,
      expenses: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const e of entries) {
    if (e.status !== "paid") continue;
    const ref = e.dueDate ?? e.createdAt;
    const d = new Date(ref);
    if (Number.isNaN(d.getTime())) continue;
    const b = byKey.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (!b) continue;
    if (e.type === "income") b.income += e.amount;
    else b.expenses += e.amount;
  }
  return buckets;
}

/** Próximo vencimento de um lançamento recorrente (mantém o dia; fim de mês ajusta). */
export function nextDueDate(due: Date, recurrence: FinanceRecurrence): Date {
  const months = recurrence === "anual" ? 12 : 1;
  const y = due.getUTCFullYear();
  const m = due.getUTCMonth() + months;
  const day = due.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay), due.getUTCHours(), due.getUTCMinutes()));
}
