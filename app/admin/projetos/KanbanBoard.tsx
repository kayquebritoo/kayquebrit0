"use client";
import { useCallback, useEffect, useState } from "react";
import { PIPELINE } from "@/lib/kbos/constants";
import ProjectPanel from "./ProjectPanel";

type Project = {
  id: string;
  titulo: string;
  categoria: string;
  status: string;
  valor: string | null;
  prazo: string | null;
};

export default function KanbanBoard() {
  const [items, setItems] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [form, setForm] = useState({ titulo: "", categoria: "video", clienteEmail: "", valor: "", prazo: "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha.");
        if (alive) setItems(data.items);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function move(id: string, status: string) {
    setItems((s) => s.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Falha ao mover.");
    } catch {
      load();
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, valor: form.valor || undefined, prazo: form.prazo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setForm({ titulo: "", categoria: "video", clienteEmail: "", valor: "", prazo: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        {error.includes("DATABASE_URL") || error.includes("connect")
          ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push`."
          : error}
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={create} className="mb-6 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-6">
        <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required placeholder="Novo projeto..." className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2" />
        <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none">
          {["fotografia", "video", "sites", "apps", "lojas", "design"].map((c) => (
            <option key={c} value={c} className="bg-[#12122a]">{c}</option>
          ))}
        </select>
        <input value={form.clienteEmail} onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })} placeholder="E-mail do cliente" type="email" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
        <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="Valor R$" inputMode="decimal" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
        <button type="submit" className="rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black">Criar</button>
      </form>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/project-id");
              if (id) move(id, col.id);
            }}
            className="w-[260px] shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3"
          >
            <p className="px-1 text-[11px] uppercase tracking-[0.25em] text-white/50">
              {col.label} · {items.filter((p) => p.status === col.id).length}
            </p>
            <div className="mt-3 space-y-2">
              {items.filter((p) => p.status === col.id).map((p) => (
                <button
                  key={p.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/project-id", p.id)}
                  onClick={() => setSelected(p)}
                  className="block w-full cursor-grab rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-white/30 active:cursor-grabbing"
                >
                  <p className="text-sm font-medium leading-snug">{p.titulo}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/40">{p.categoria}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && <ProjectPanel project={selected} onClose={() => { setSelected(null); load(); }} />}
    </div>
  );
}
