"use client";
import { useCallback, useEffect, useState } from "react";

type Trx = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string | null;
  valor: string;
  vencimento: string | null;
  status: "pendente" | "pago" | "vencido";
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Financeiro() {
  const [items, setItems] = useState<Trx[]>([]);
  const [resumo, setResumo] = useState({ entradas: 0, saidas: 0, saldo: 0, aReceber: 0, aPagar: 0 });
  const [error, setError] = useState("");
  const [form, setForm] = useState({ tipo: "entrada", descricao: "", valor: "", vencimento: "", categoria: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setItems(data.items);
      setResumo(data.resumo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/transactions");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha.");
        if (!alive) return;
        setItems(data.items);
        setResumo(data.resumo);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, valor: form.valor, vencimento: form.vencimento || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setForm({ tipo: "entrada", descricao: "", valor: "", vencimento: "", categoria: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function cycle(t: Trx) {
    const next = t.status === "pendente" ? "pago" : t.status === "pago" ? "vencido" : "pendente";
    await fetch(`/api/transactions/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push`.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { k: "Recebido", v: brl(resumo.entradas), c: "text-emerald-300" },
          { k: "Pago", v: brl(resumo.saidas), c: "text-rose-300" },
          { k: "Saldo", v: brl(resumo.saldo), c: "text-white" },
          { k: "A receber", v: brl(resumo.aReceber), c: "text-amber-200" },
          { k: "A pagar", v: brl(resumo.aPagar), c: "text-amber-200" },
        ].map((s) => (
          <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{s.k}</p>
            <p className={`font-display mt-1 text-xl md:text-2xl ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <form onSubmit={create} className="mt-6 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-6">
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none">
          <option value="entrada" className="bg-[#12122a]">Entrada</option>
          <option value="saida" className="bg-[#12122a]">Saída</option>
        </select>
        <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required placeholder="Descrição" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2" />
        <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required placeholder="Valor R$" inputMode="decimal" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
        <input value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} type="date" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none" />
        <button type="submit" className="rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black">Lançar</button>
      </form>

      <div className="mt-6 space-y-2">
        {items.map((t) => (
          <button key={t.id} onClick={() => cycle(t)} title="Toque para alternar o status" className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.tipo === "entrada" ? "bg-emerald-400" : "bg-rose-400"}`} />
            <span className="flex-1 truncate">{t.descricao}</span>
            <span className="hidden text-white/40 sm:block">{t.vencimento ? new Date(t.vencimento).toLocaleDateString("pt-BR") : "—"}</span>
            <span className="font-medium tabular-nums">{brl(Number(t.valor))}</span>
            <span className="w-[86px] shrink-0 text-right text-[11px] uppercase tracking-[0.15em] text-white/55">{t.status}</span>
          </button>
        ))}
        {items.length === 0 && <p className="text-sm font-light text-white/40">Nenhum lançamento ainda.</p>}
      </div>
    </div>
  );
}
