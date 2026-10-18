// Relatórios do KBOS (funções puras): resultado do mês, lucro por projeto,
// previsão de caixa 30/60/90 dias e controle do teto anual do MEI.
// Data de referência de cada lançamento = vencimento (ou criação, se não tiver).
import { frontOf, type Front } from "./fronts";

export const MEI_LIMIT = 81_000; // teto anual vigente em 2026 (propostas de aumento ainda em tramitação)
export const MEI_TOLERANCE = 1.2; // até 20% acima: segue MEI até 31/12 e paga guia complementar

type D = Date | string | null;
export type Trx = {
  tipo: string; valor: string | number; status: string; scope: string;
  categoria: string | null; vencimento: D; createdAt: D; projectId: string | null;
};
export type Proj = { id: string; titulo: string; categoria: string; valor: string | number | null };

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const when = (t: Trx) => new Date((t.vencimento ?? t.createdAt) as string | Date);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export type Scope = "empresa" | "pessoal" | "tudo";
const inScope = (t: Trx, s: Scope) => s === "tudo" || t.scope === s;

export type MonthResult = {
  month: string;
  income: number;
  expense: number;
  result: number;
  pendingIncome: number;
  pendingExpense: number;
  byCategory: { categoria: string; tipo: "entrada" | "saida"; total: number }[];
  byFront: Partial<Record<Front, number>>;
};

export function monthResult(trx: Trx[], projects: Proj[], month: string, scope: Scope): MonthResult {
  const proj = new Map(projects.map((p) => [p.id, p]));
  const out: MonthResult = { month, income: 0, expense: 0, result: 0, pendingIncome: 0, pendingExpense: 0, byCategory: [], byFront: {} };
  const cats = new Map<string, number>();
  for (const t of trx) {
    if (!inScope(t, scope) || monthKey(when(t)) !== month) continue;
    const v = num(t.valor);
    const entrada = t.tipo === "entrada";
    if (t.status === "pago") {
      if (entrada) {
        out.income += v;
        const p = t.projectId ? proj.get(t.projectId) : undefined;
        const f = p ? frontOf(p.categoria) : null;
        if (f) out.byFront[f] = (out.byFront[f] ?? 0) + v;
      } else out.expense += v;
      const key = `${entrada ? "entrada" : "saida"}|${t.categoria || "Sem categoria"}`;
      cats.set(key, (cats.get(key) ?? 0) + v);
    } else if (entrada) out.pendingIncome += v;
    else out.pendingExpense += v;
  }
  out.result = out.income - out.expense;
  out.byCategory = [...cats.entries()]
    .map(([k, total]) => { const [tipo, categoria] = k.split("|"); return { categoria, tipo: tipo as "entrada" | "saida", total }; })
    .sort((a, b) => b.total - a.total);
  return out;
}

export type ProjectProfit = { id: string; titulo: string; front: Front | null; received: number; cost: number; net: number; hours: number; perHour: number | null };

/** Lucro por projeto: recebido − custos ligados ao projeto, e R$/hora (só se houver horas registradas). */
export function projectProfit(trx: Trx[], projects: Proj[], secondsByProject: Record<string, number>): ProjectProfit[] {
  return projects
    .map((p) => {
      const mine = trx.filter((t) => t.projectId === p.id && t.status === "pago" && t.scope === "empresa");
      const received = mine.filter((t) => t.tipo === "entrada").reduce((a, t) => a + num(t.valor), 0);
      const cost = mine.filter((t) => t.tipo === "saida").reduce((a, t) => a + num(t.valor), 0);
      const hours = (secondsByProject[p.id] ?? 0) / 3600;
      const net = received - cost;
      return { id: p.id, titulo: p.titulo, front: frontOf(p.categoria), received, cost, net, hours, perHour: hours >= 0.25 ? net / hours : null };
    })
    .filter((r) => r.received > 0 || r.cost > 0 || r.hours > 0)
    .sort((a, b) => b.net - a.net);
}

export type Forecast = { days: 30 | 60 | 90; income: number; expense: number; net: number; late: number };

/** Previsão: o que está pendente e vence em até N dias. Atrasados ficam à parte (late) e entram só como "a receber/pagar". */
export function forecast(trx: Trx[], scope: Scope, now = new Date()): Forecast[] {
  const t0 = now.getTime();
  return ([30, 60, 90] as const).map((days) => {
    const end = t0 + days * 86_400_000;
    let income = 0, expense = 0, late = 0;
    for (const t of trx) {
      if (!inScope(t, scope) || t.status === "pago" || !t.vencimento) continue;
      const at = new Date(t.vencimento).getTime();
      const v = num(t.valor);
      if (at < t0) { if (t.tipo === "entrada") late += v; continue; }
      if (at > end) continue;
      if (t.tipo === "entrada") income += v; else expense += v;
    }
    return { days, income, expense, net: income - expense, late };
  });
}

export type MeiStatus = {
  year: number; revenue: number; limit: number; pct: number; remaining: number;
  level: "ok" | "atencao" | "perigo" | "excedeu" | "desenquadra";
  monthlyAverageLeft: number | null; projected: number; message: string;
};

/** MEI: soma das entradas pagas da empresa no ano (aproximação de caixa). */
export function meiStatus(trx: Trx[], now = new Date(), limit = MEI_LIMIT): MeiStatus {
  const year = now.getUTCFullYear();
  const revenue = trx
    .filter((t) => t.tipo === "entrada" && t.status === "pago" && t.scope === "empresa" && when(t).getUTCFullYear() === year)
    .reduce((a, t) => a + num(t.valor), 0);
  const pct = revenue / limit;
  const monthsLeft = 12 - now.getUTCMonth(); // inclui o mês atual
  const remaining = Math.max(0, limit - revenue);
  const projected = (revenue / Math.max(1, now.getUTCMonth() + 1)) * 12;
  let level: MeiStatus["level"] = "ok";
  let message = "Dentro do limite.";
  if (revenue > limit * MEI_TOLERANCE) { level = "desenquadra"; message = "Passou de 20% do teto: o desenquadramento é retroativo. Fale com seu contador agora."; }
  else if (revenue > limit) { level = "excedeu"; message = "Passou do teto, mas dentro dos 20%: segue MEI até 31/12, paga guia complementar e vira ME em janeiro."; }
  else if (pct >= 0.9) { level = "perigo"; message = "Menos de 10% do teto sobrando. Pense em quais entradas segurar ou na migração para ME."; }
  else if (pct >= 0.8) { level = "atencao"; message = "Chegou a 80% do teto. Vale acompanhar de perto até dezembro."; }
  if (level === "ok" && projected > limit) message = "Dentro do limite hoje, mas no ritmo atual passa do teto até dezembro.";
  return { year, revenue, limit, pct, remaining, level, monthlyAverageLeft: monthsLeft > 0 ? remaining / monthsLeft : null, projected, message };
}
