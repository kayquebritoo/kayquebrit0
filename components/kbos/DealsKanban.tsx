"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEAL_STAGES } from "@/lib/kbos/constants";

type Deal = {
  id: string;
  title: string;
  contactId: string | null;
  stage: string;
  value: string | null;
  position: number;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
};
type Contact = { id: string; name: string; company: string | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: string | null) => Number(v || 0) || 0;

export default function DealsKanban() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", contactId: "", value: "" });
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [d, c] = await Promise.all([
        fetch("/api/deals").then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Falha nos negócios.");
          return j.items as Deal[];
        }),
        fetch("/api/contacts").then(async (r) => {
          const j = await r.json();
          if (!r.ok) return [] as Contact[];
          return (j.items || []) as Contact[];
        }),
      ]);
      setDeals(d);
      setContacts(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(id: string, stage: string) {
    setDeals((s) => s.map((d) => (d.id === id ? { ...d, stage } : d)));
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error();
    } catch {
      load();
    }
  }

  async function step(id: string, dir: 1 | -1) {
    const deal = deals.find((d) => d.id === id);
    if (!deal) return;
    const idx = DEAL_STAGES.findIndex((s) => s.id === deal.stage);
    const next = DEAL_STAGES[idx + dir];
    if (next) move(id, next.id);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          contactId: form.contactId || undefined,
          value: form.value || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha.");
      setForm({ title: "", contactId: "", value: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este negócio?")) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    load();
  }

  const totals = useMemo(() => {
    const t: Record<string, { count: number; sum: number }> = {};
    for (const s of DEAL_STAGES) t[s.id] = { count: 0, sum: 0 };
    for (const d of deals) {
      const k = t[d.stage] ?? (t[d.stage] = { count: 0, sum: 0 });
      k.count += 1;
      k.sum += num(d.value);
    }
    return t;
  }, [deals]);
  const grand = useMemo(() => deals.reduce((a, d) => (d.stage !== "lost" ? a + num(d.value) : a), 0), [deals]);

  if (error && deals.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        {error.includes("DATABASE_URL") || error.includes("connect")
          ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push` (migration 0002_fase1_crm_kanban)."
          : error}
      </div>
    );
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">
          Pipeline · <span className="text-white/80">{deals.length} negócios</span> ·{" "}
          <span className="text-emerald-300">{brl(grand)} em aberto</span>
        </p>
      </div>

      <form onSubmit={create} className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          placeholder="Novo negócio (ex. Site institucional — Padaria Pão Dourado)"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-5"
        />
        <select
          value={form.contactId}
          onChange={(e) => setForm({ ...form, contactId: e.target.value })}
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none md:col-span-4"
        >
          <option value="" className="bg-[#12122a]">Sem contato vinculado</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#12122a]">
              {c.name}{c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </select>
        <input
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          placeholder="Valor R$"
          inputMode="decimal"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2"
        />
        <button type="submit" className="rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-95 md:col-span-1">
          +
        </button>
      </form>

      <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-4">
        {DEAL_STAGES.map((col) => {
          const list = deals.filter((d) => d.stage === col.id);
          const t = totals[col.id] ?? { count: 0, sum: 0 };
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.id);
              }}
              onDragLeave={() => setDragOver((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/deal-id");
                if (id) move(id, col.id);
                setDragOver(null);
              }}
              className={`w-[270px] shrink-0 snap-start rounded-2xl border p-3 transition-all duration-200 ${
                dragOver === col.id ? "scale-[1.02] border-white/50 bg-white/[0.06]" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex items-baseline justify-between px-1">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
                  {col.label} · {t.count}
                </p>
              </div>
              <p className="mt-0.5 px-1 text-[13px] font-semibold tabular-nums text-emerald-200/90">{brl(t.sum)}</p>
              <div className="mt-3 space-y-2">
                {list.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/deal-id", d.id)}
                    className="cursor-grab rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-white/30 active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium leading-snug">{d.title}</p>
                    <p className="mt-1 text-[12px] text-white/50">
                      {d.contactName ? `${d.contactName}${d.contactCompany ? ` · ${d.contactCompany}` : ""}` : "sem contato"}
                    </p>
                    <p className="mt-1 text-[13px] font-semibold tabular-nums text-white/85">{d.value ? brl(num(d.value)) : "—"}</p>
                    <div className="mt-2 flex items-center gap-1">
                      <button onClick={() => step(d.id, -1)} aria-label="Voltar estágio" className="rounded-lg border border-white/15 px-2 py-1 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95">
                        ←
                      </button>
                      <button onClick={() => step(d.id, 1)} aria-label="Avançar estágio" className="rounded-lg border border-white/15 px-2 py-1 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95">
                        →
                      </button>
                      <button onClick={() => remove(d.id)} aria-label="Excluir" className="ml-auto rounded-lg px-2 py-1 text-[12px] text-white/35 transition hover:text-rose-300">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[12px] text-white/30">Arraste para cá</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-white/35">Dica: arraste os cards entre colunas no desktop; no mobile use as setas ← →.</p>
    </div>
  );
}
