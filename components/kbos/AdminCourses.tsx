"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Course = {
  id: string;
  titulo: string;
  slug: string;
  descricao: string | null;
  preco: string | null;
  status: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function fetchCourses() {
  const res = await fetch("/api/lms/courses");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Falha.");
  return (data.items || []) as Course[];
}

export default function AdminCourses() {
  const [items, setItems] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ titulo: "", preco: "", descricao: "", status: "rascunho" });

  async function load() {
    try {
      setItems(await fetchCourses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const items = await fetchCourses();
        if (!alive) return;
        setItems(items);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/lms/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          preco: form.preco || undefined,
          descricao: form.descricao || undefined,
          status: form.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha.");
      setForm({ titulo: "", preco: "", descricao: "", status: "rascunho" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
      <form onSubmit={create} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12">
        <input
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
          required
          placeholder="Título do curso"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-4"
        />
        <input
          value={form.preco}
          onChange={(e) => setForm({ ...form, preco: e.target.value })}
          placeholder="Preço R$ (ex. 497.00)"
          inputMode="decimal"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2"
        />
        <input
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          placeholder="Descrição curta"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-3"
        />
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none md:col-span-1"
        >
          {["rascunho", "publicado", "arquivado"].map((s) => (
            <option key={s} value={s} className="bg-[#12122a]">{s}</option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black md:col-span-2">
          Criar curso
        </button>
      </form>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <Link key={c.id} href={`/admin/cursos/${c.id}`} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/30">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-xl group-hover:underline">{c.titulo}</h2>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/75">
                {c.status}
              </span>
            </div>
            <p className="mt-2 text-sm tabular-nums text-white/60">{c.preco ? brl(Number(c.preco)) : "sem preço"}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-white/35">/{c.slug}</p>
          </Link>
        ))}
        {items.length === 0 && <p className="text-sm font-light text-white/40">Nenhum curso ainda.</p>}
      </div>
    </div>
  );
}
