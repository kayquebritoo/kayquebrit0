// Lucro por cliente (funções puras). Regras:
//  - só conta o que está PAGO; o que está pendente/vencido aparece à parte;
//  - entrada vai para o cliente do lançamento (contactId) ou, se não tiver, para o cliente do projeto;
//  - saída (custo) vai para o cliente do projeto (ou do contactId); saída sem cliente é "custo geral" e não pesa em ninguém;
//  - data de referência = vencimento (ou criação), como nos demais relatórios.
export type CTrx = {
  tipo: string; valor: string | number; status: string; scope: string;
  vencimento: Date | string | null; createdAt: Date | string | null;
  projectId: string | null; contactId: string | null;
};
export type CProj = { id: string; contactId: string | null };
export type CContact = { id: string; name: string; company: string | null; status: string; photoUrl?: string | null };

export type ClientProfitRow = {
  contactId: string; name: string; company: string | null; photoUrl: string | null;
  income: number; cost: number; profit: number; margin: number | null;
  pending: number; payments: number; lastPaymentAt: string | null; share: number; prevProfit: number | null; delta: number | null;
};
export type ClientProfit = {
  from: string; to: string; rows: ClientProfitRow[];
  totals: { income: number; cost: number; profit: number; pending: number };
  unassigned: { income: number; cost: number; count: number };
  best: ClientProfitRow | null;
};

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const when = (t: CTrx) => new Date((t.vencimento ?? t.createdAt) as string | Date);

function sums(trx: CTrx[], projects: CProj[], from: Date, to: Date, scope: string) {
  const proj = new Map(projects.map((p) => [p.id, p.contactId]));
  const by = new Map<string, { income: number; cost: number; pending: number; payments: number; last: Date | null }>();
  const un = { income: 0, cost: 0, count: 0 };
  for (const t of trx) {
    if (scope !== "tudo" && t.scope !== scope) continue;
    const d = when(t);
    if (!(d >= from && d <= to)) continue;
    const owner = t.contactId ?? (t.projectId ? proj.get(t.projectId) ?? null : null);
    const v = num(t.valor);
    const entrada = t.tipo === "entrada";
    if (!owner) {
      if (t.status === "pago") { if (entrada) un.income += v; else un.cost += v; un.count++; }
      continue;
    }
    const a = by.get(owner) ?? { income: 0, cost: 0, pending: 0, payments: 0, last: null };
    if (t.status === "pago") {
      if (entrada) { a.income += v; a.payments++; if (!a.last || d > a.last) a.last = d; } else a.cost += v;
    } else if (entrada) a.pending += v;
    by.set(owner, a);
  }
  return { by, un };
}

/** Ranking de clientes por lucro no período [from, to] (inclusive), com comparação com o período anterior de mesmo tamanho. */
export function clientProfit(trx: CTrx[], projects: CProj[], contacts: CContact[], from: Date, to: Date, scope = "empresa"): ClientProfit {
  const cur = sums(trx, projects, from, to, scope);
  const span = to.getTime() - from.getTime();
  const prev = sums(trx, projects, new Date(from.getTime() - span - 1), new Date(from.getTime() - 1), scope);
  const info = new Map(contacts.map((c) => [c.id, c]));
  const rows: ClientProfitRow[] = [];
  for (const [id, a] of cur.by) {
    if (!a.income && !a.cost && !a.pending) continue;
    const c = info.get(id);
    const profit = a.income - a.cost;
    const p = prev.by.get(id);
    const prevProfit = p ? p.income - p.cost : null;
    rows.push({
      contactId: id, name: c?.name ?? "Cliente removido", company: c?.company ?? null, photoUrl: c?.photoUrl ?? null,
      income: a.income, cost: a.cost, profit, margin: a.income > 0 ? profit / a.income : null,
      pending: a.pending, payments: a.payments, lastPaymentAt: a.last ? a.last.toISOString() : null, share: 0,
      prevProfit, delta: prevProfit && prevProfit > 0 ? (profit - prevProfit) / prevProfit : null,
    });
  }
  rows.sort((x, y) => y.profit - x.profit || y.income - x.income);
  const totalProfit = rows.reduce((s, r) => s + Math.max(0, r.profit), 0);
  for (const r of rows) r.share = totalProfit > 0 && r.profit > 0 ? r.profit / totalProfit : 0;
  const totals = rows.reduce((s, r) => ({ income: s.income + r.income, cost: s.cost + r.cost, profit: s.profit + r.profit, pending: s.pending + r.pending }), { income: 0, cost: 0, profit: 0, pending: 0 });
  return { from: from.toISOString(), to: to.toISOString(), rows, totals, unassigned: cur.un, best: rows.find((r) => r.profit > 0) ?? null };
}

/** Períodos prontos, no horário de Belém (UTC−3). */
export function periodRange(kind: string, nowUtc = new Date()): { from: Date; to: Date; label: string } {
  const b = new Date(nowUtc.getTime() - 3 * 3_600_000); // "agora" em Belém, lido com getUTC*
  const y = b.getUTCFullYear(), m = b.getUTCMonth();
  const start = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1, 3, 0, 0)); // 00:00 de Belém
  const end = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 1, 3, 0, 0) - 1);
  switch (kind) {
    case "mes-passado": return { from: start(y, m - 1), to: end(y, m - 1), label: "Mês passado" };
    case "ano": return { from: start(y, 0), to: end(y, 11), label: `${y}` };
    case "ano-passado": return { from: start(y - 1, 0), to: end(y - 1, 11), label: `${y - 1}` };
    case "12m": return { from: start(y, m - 11), to: end(y, m), label: "Últimos 12 meses" };
    default: return { from: start(y, m), to: end(y, m), label: "Este mês" };
  }
}
