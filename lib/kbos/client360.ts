// Ficha 360° do cliente: junta tudo que o KBOS sabe dele numa linha do tempo e num resumo.
import { frontOf, type Front } from "./fronts";

export type Kind = "negocio" | "orcamento" | "projeto" | "cobranca" | "pagamento" | "tarefa" | "conversa" | "case";

export type TimelineEvent = { id: string; at: string; kind: Kind; title: string; detail?: string; amount?: number; href?: string; tone?: "late" | "soon" | "done" };

type D = Date | string | null;
const iso = (d: D) => (d ? new Date(d).toISOString() : null);
const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

export type Input = {
  deals: { id: string; title: string; stage: string; value: string | null; createdAt: D }[];
  budgets: { id: string; code: string; title: string; status: string; totalAmount: string; createdAt: D }[];
  projects: { id: string; titulo: string; categoria: string; status: string; valor: string | null; prazo: D; createdAt: D }[];
  transactions: { id: string; tipo: string; descricao: string; valor: string; status: string; vencimento: D; createdAt: D }[];
  tasks: { id: string; titulo: string; status: string; dueAt: D; createdAt: D }[];
  conversations: { id: string; channel: string; lastMessageAt: D; lastPreview: string | null; createdAt: D }[];
  cases: { id: string; title: string; status: string; createdAt: D }[];
};

const BUDGET_LABEL: Record<string, string> = { draft: "Rascunho", sent: "Enviado", approved: "Aprovado", rejected: "Recusado", completed: "Concluído", cancelled: "Cancelado" };
const PROJECT_LABEL: Record<string, string> = { novo: "Novo", briefing: "Briefing", producao: "Em produção", revisao: "Revisão", aprovado: "Aprovado", entregue: "Entregue" };
const STAGE_LABEL: Record<string, string> = { prospecting: "Prospecção", proposal: "Proposta", negotiation: "Negociação", won: "Ganho", lost: "Perdido" };

export function buildTimeline(i: Input, now = new Date()): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const d of i.deals) out.push({ id: `d-${d.id}`, at: iso(d.createdAt)!, kind: "negocio", title: d.title, detail: STAGE_LABEL[d.stage] ?? d.stage, amount: d.value ? num(d.value) : undefined, href: "/admin/kanban" });
  for (const b of i.budgets) out.push({ id: `b-${b.id}`, at: iso(b.createdAt)!, kind: "orcamento", title: `${b.code} · ${b.title}`, detail: BUDGET_LABEL[b.status] ?? b.status, amount: num(b.totalAmount), href: "/admin/orcamentos" });
  for (const p of i.projects) {
    const f = frontOf(p.categoria);
    out.push({ id: `p-${p.id}`, at: iso(p.createdAt)!, kind: "projeto", title: p.titulo, detail: [PROJECT_LABEL[p.status] ?? p.status, f && f.toUpperCase().slice(0, 1) + f.slice(1)].filter(Boolean).join(" · "), amount: p.valor ? num(p.valor) : undefined, href: "/admin/projetos", tone: p.status === "entregue" ? "done" : undefined });
  }
  for (const t of i.transactions) {
    const paid = t.status === "pago";
    const due = t.vencimento ? new Date(t.vencimento) : null;
    const late = !paid && !!due && due.getTime() < now.getTime();
    out.push({
      id: `t-${t.id}`,
      at: iso(paid ? t.createdAt : (t.vencimento ?? t.createdAt))!,
      kind: paid ? "pagamento" : "cobranca",
      title: t.descricao,
      detail: paid ? (t.tipo === "entrada" ? "Recebido" : "Pago") : late ? "Atrasado" : t.tipo === "entrada" ? "A receber" : "A pagar",
      amount: num(t.valor),
      href: "/admin/financeiro",
      tone: late ? "late" : paid ? "done" : undefined,
    });
  }
  for (const t of i.tasks) {
    const late = t.status !== "done" && !!t.dueAt && new Date(t.dueAt).getTime() < now.getTime();
    out.push({ id: `k-${t.id}`, at: iso(t.dueAt ?? t.createdAt)!, kind: "tarefa", title: t.titulo, detail: t.status === "done" ? "Feita" : late ? "Atrasada" : "Aberta", href: "/admin/tarefas", tone: late ? "late" : t.status === "done" ? "done" : undefined });
  }
  for (const c of i.conversations) out.push({ id: `c-${c.id}`, at: iso(c.lastMessageAt ?? c.createdAt)!, kind: "conversa", title: `Conversa no ${c.channel}`, detail: c.lastPreview ?? undefined, href: "/admin/inbox" });
  for (const c of i.cases) out.push({ id: `s-${c.id}`, at: iso(c.createdAt)!, kind: "case", title: c.title, detail: c.status === "published" ? "Case no ar" : "Case em preparo", href: "/admin/cases" });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export type Summary = {
  received: number;
  open: number;
  overdue: number;
  activeProjects: number;
  openBudgets: number;
  openBudgetsValue: number;
  firstContact: string | null;
  lastActivity: string | null;
  byFront: Partial<Record<Front, number>>;
};

export function buildSummary(i: Input, now = new Date()): Summary {
  const inc = i.transactions.filter((t) => t.tipo === "entrada");
  const received = inc.filter((t) => t.status === "pago").reduce((a, t) => a + num(t.valor), 0);
  const unpaid = inc.filter((t) => t.status !== "pago");
  const overdue = unpaid.filter((t) => t.status === "vencido" || (!!t.vencimento && new Date(t.vencimento).getTime() < now.getTime())).reduce((a, t) => a + num(t.valor), 0);
  const openB = i.budgets.filter((b) => b.status === "draft" || b.status === "sent");
  const byFront: Summary["byFront"] = {};
  for (const p of i.projects) {
    const f = frontOf(p.categoria);
    if (f) byFront[f] = (byFront[f] ?? 0) + num(p.valor);
  }
  const events = buildTimeline(i, now);
  return {
    received,
    open: unpaid.reduce((a, t) => a + num(t.valor), 0),
    overdue,
    activeProjects: i.projects.filter((p) => p.status !== "entregue").length,
    openBudgets: openB.length,
    openBudgetsValue: openB.reduce((a, b) => a + num(b.totalAmount), 0),
    firstContact: events.length ? events[events.length - 1].at : null,
    lastActivity: events.length ? events[0].at : null,
    byFront,
  };
}
