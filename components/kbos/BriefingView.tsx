"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Briefing = {
  id: string;
  categoria: string;
  categoriaLabel: string;
  clienteNome: string;
  status: string;
  fields: { name: string; label: string }[];
  respostas: Record<string, string>;
};

export default function BriefingView() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Briefing | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/briefings/${id}`);
        if (!res.ok) throw new Error("Não encontrado.");
        const data = await res.json();
        if (alive) setB(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] px-5 text-[#F4F1EC]">
        <p className="text-white/60">{error}</p>
      </main>
    );
  }
  if (!b) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] px-5 text-[#F4F1EC]">
        <p className="text-white/50">Carregando...</p>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-[#0B0B1E] px-5 pb-20 pt-24 text-[#F4F1EC] md:pt-28">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-300">✓ Briefing recebido</p>
        <h1 className="font-display mt-3 text-4xl font-light md:text-5xl">
          Valeu, {b.clienteNome.split(" ")[0]}!
        </h1>
        <p className="mt-3 text-[15px] font-light text-white/60">
          Categoria: {b.categoriaLabel} · Status: {b.status}
        </p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h2 className="text-[12px] uppercase tracking-[0.25em] text-white/45">Suas respostas</h2>
          <dl className="mt-4 space-y-3">
            {b.fields.map((f) => (
              <div key={f.name} className="border-b border-white/5 pb-3">
                <dt className="text-[11px] uppercase tracking-[0.2em] text-white/40">{f.label}</dt>
                <dd className="mt-1 text-[15px]">{b.respostas[f.name] || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <a
          href={`/api/briefings/${b.id}/contrato`}
          className="mt-6 block rounded-full bg-white py-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02]"
        >
          Baixar contrato (PDF)
        </a>
        <div className="mt-4 flex justify-center gap-6 text-[12px] uppercase tracking-[0.2em] text-white/45">
          <Link href="/briefing" className="hover:text-white">Novo briefing</Link>
          <Link href="/" className="hover:text-white">Site</Link>
        </div>
      </div>
    </main>
  );
}
