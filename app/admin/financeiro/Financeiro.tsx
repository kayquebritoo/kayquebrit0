"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FINANCE_STATUS, FINANCE_TYPES } from "@/lib/kbos/constants";

type Entry = {
  id: string;
  type: "income" | "expense";
  description: string;
  amount: number;
  category: string | null;
  dueDate: string | null;
  status: "pending" | "paid" | "overdue";
  createdAt: string;
};

type Summary = { income: number; expenses: number; balance: number; receivable: number; payable: number };
type CashPoint = { key: string; label: string; income: number; expenses: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS_LABEL: Record<string, string> = Object.fromEntries(FINANCE_STATUS.map((s) => [s.id, s.label]));
const emptyForm = { type: "income", description: "", amount: "", category: "", dueDate: "", status: "pending" };

function CashChart({ data }: { data: CashPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]));
  return (
    <div>
      <div className="flex h-40 items-end gap-3 md:h-48">
        {data.map((d) => (
          <div key={d.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-full w-full max-w-[64px] items-end justify-center gap-1">
              <div
                className="w-full rounded-t-md bg-emerald-400/80 transition-all duration-500"
                style={{ height: `${Math.max(2, (d.income / max) * 100)}%` }}
                title={`Receitas: ${brl(d.income)}`}
              />
              <div
                className="w-full rounded-t-md bg-rose-400/80 transition-all duration-500"
                style={{ height: `${Math.max(2, (d.expenses / max) * 100)}%` }}
                title={`Despesas: ${brl(d.expenses)}`}
              />
            </div>
            <span className="truncate text-[11px] capitalize text-white/45">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Receitas pagas</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Despesas pagas</span>
      </div>
    </div>
  );
}

export default function Financeiro() {
  const [items, setItems] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expenses: 0, balance: 0, receivable: 0, payable: 0 });
  const [cash, setCash] = useState<CashPoint[]>([]);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (statusFilter !== "all") p.set("status", statusFilter);
      const res = await fetch(`/api/finance?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setItems(data.items || []);
      setSummary(data.summary);
      setCash(data.cashFlow || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          description: form.description.trim(),
          amount: form.amount,
          category: form.category.trim() || undefined,
          dueDate: form.dueDate || undefined,
          status: form.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha.");
      setForm(emptyForm);
      setModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(e: Entry) {
    const next = e.status === "paid" ? "pending" : "paid";
    await fetch(`/api/finance/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/finance/${id}`, { method: "DELETE" });
    load();
  }

  const cards = useMemo(
    () => [
      { k: "Recebido", v: brl(summary.income), c: "text-emerald-300" },
      { k: "Pago", v: brl(summary.expenses), c: "text-rose-300" },
      { k: "Saldo", v: brl(summary.balance), c: "text-white" },
      { k: "A receber", v: brl(summary.receivable), c: "text-amber-200" },
      { k: "A pagar", v: brl(summary.payable), c: "text-amber-200" },
    ],
    [summary]
  );

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        {error.includes("DATABASE_URL") || error.includes("connect")
          ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push` (migration 0005_fase4_finance_agenda)."
          : error}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((s) => (
          <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{s.k}</p>
            <p className={`font-display mt-1 text-xl tabular-nums md:text-2xl ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">Fluxo de caixa · últimos 6 meses</p>
        <div className="mt-3">
          <CashChart data={cash} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        {[{ id: "all", label: "Tudo" }, ...FINANCE_TYPES].map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition active:scale-95 ${
              typeFilter === t.id ? "bg-white font-bold text-black" : "border border-white/15 text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
        {[{ id: "all", label: "Todos status" }, ...FINANCE_STATUS].map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition active:scale-95 ${
              statusFilter === s.id ? "bg-white font-bold text-black" : "border border-white/15 text-white/60 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button onClick={() => setModal(true)} className="ml-auto rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:opacity-90 active:scale-95">
          + Lançar
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm transition hover:border-white/25">
            <button onClick={() => toggle(t)} title="Toque para alternar pago/pendente" className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.type === "income" ? "bg-emerald-400" : "bg-rose-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.description}</span>
                <span className="block truncate text-[12px] text-white/40">
                  {[t.category, t.dueDate ? new Date(t.dueDate).toLocaleDateString("pt-BR") : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="font-medium tabular-nums">{brl(Number(t.amount))}</span>
              <span className="w-[86px] shrink-0 text-right text-[11px] uppercase tracking-[0.15em] text-white/55">
                {STATUS_LABEL[t.status] ?? t.status}
              </span>
            </button>
            <button onClick={() => remove(t.id)} aria-label="Excluir" className="shrink-0 rounded-lg px-2 py-1 text-white/35 transition hover:text-rose-300">
              ×
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="py-6 text-center text-sm font-light text-white/40">Nenhum lançamento neste filtro.</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setModal(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-[kbosUp_0.25s_ease] rounded-t-3xl border border-white/10 bg-[#1a1828] p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Lançamento rápido</h2>
              <button type="button" onClick={() => setModal(false)} aria-label="Fechar" className="rounded-lg px-2 text-2xl leading-none text-white/60 hover:text-white">×</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["income", "expense"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={`rounded-xl border py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] transition active:scale-95 ${
                    form.type === t ? (t === "income" ? "border-emerald-400 bg-emerald-400/15 text-emerald-200" : "border-rose-400 bg-rose-400/15 text-rose-200") : "border-white/15 text-white/55"
                  }`}
                >
                  {t === "income" ? "↑ Receita" : "↓ Despesa"}
                </button>
              ))}
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="Descrição *" className="col-span-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="Valor R$ *" inputMode="decimal" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <input value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} type="date" aria-label="Vencimento" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none" />
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoria" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none">
                <option value="pending" className="bg-[#1a1828]">Pendente</option>
                <option value="paid" className="bg-[#1a1828]">Pago</option>
              </select>
            </div>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:opacity-90 disabled:opacity-50">
              {saving ? "Lançando..." : "Lançar"}
            </button>
          </form>
          <style>{`@keyframes kbosUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
    </div>
  );
}
