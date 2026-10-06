import Link from "next/link";
import { BRIEFING_CATEGORIES } from "@/lib/kbos/briefing-forms";

export const metadata = { title: "Briefing — KBOS" };

export default function BriefingHome() {
  return (
    <main className="min-h-screen bg-[#0B0B1E] px-5 pb-20 pt-24 text-[#F4F1EC] md:pt-28">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-[11px] uppercase tracking-[0.3em] text-white/45 hover:text-white">
          ← Voltar
        </Link>
        <p className="mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45">KBOS · Briefing</p>
        <h1 className="font-display mt-3 text-4xl font-light leading-tight md:text-6xl">
          O que vamos <em className="italic text-[#9DB8E8]">criar</em>?
        </h1>
        <p className="mt-4 max-w-xl text-[15px] font-light leading-relaxed text-white/60">
          Escolha a categoria e responda em 2 minutos. Suas respostas viram a base do
          orçamento e do contrato.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {BRIEFING_CATEGORIES.map((c, i) => (
            <Link
              key={c.id}
              href={`/briefing/${c.id}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.05]"
            >
              <p className="text-[11px] tabular-nums tracking-[0.3em] text-white/35">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h2 className="font-display mt-2 text-2xl font-light">{c.label}</h2>
              <p className="mt-1 text-sm font-light text-white/55">{c.desc}</p>
              <p className="mt-4 text-[12px] uppercase tracking-[0.2em] text-[#9DB8E8]">
                {c.baseValue} <span aria-hidden>→</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
