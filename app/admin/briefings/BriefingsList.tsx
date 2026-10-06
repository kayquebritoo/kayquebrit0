"use client";
import { useEffect, useState } from "react";

type B = {
  id: string;
  categoria: string;
  clienteNome: string;
  clienteEmail: string;
  status: string;
  createdAt: string;
};

const STATUS = ["novo", "em_analise", "aprovado", "contrato_gerado", "arquivado"];

export default function BriefingsList() {
  const [items, setItems] = useState<B[]>([]);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const res = await fetch("/api/briefings");
      const data = await res.json();
      if (res.ok) setItems(data.items);
    } catch {
      /* mantém lista atual */
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/briefings");
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

  async function setStatus(id: string, status: string) {
    await fetch(`/api/briefings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push`.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{b.clienteNome} <span className="font-light text-white/45">· {b.clienteEmail}</span></p>
            <p className="text-[12px] uppercase tracking-[0.15em] text-white/40">{b.categoria}</p>
          </div>
          <a href={`/briefing/ver/${b.id}`} target="_blank" className="text-[12px] uppercase tracking-[0.15em] text-white/60 hover:text-white">Ver</a>
          <a href={`/api/briefings/${b.id}/contrato`} className="text-[12px] uppercase tracking-[0.15em] text-white/60 hover:text-white">PDF</a>
          <select value={b.status} onChange={(e) => setStatus(b.id, e.target.value)} className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-[12px] outline-none">
            {STATUS.map((s) => (
              <option key={s} value={s} className="bg-[#12122a]">{s}</option>
            ))}
          </select>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm font-light text-white/40">Nenhum briefing ainda.</p>}
    </div>
  );
}
