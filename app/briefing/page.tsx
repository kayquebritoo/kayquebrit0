import Link from "next/link";
import { listServices } from "@/lib/kbos/services";
import PageBackdrop from "@/components/PageBackdrop";

export const metadata = { title: "Briefing — KBOS" };

// Valores e textos vêm do catálogo editável (admin > Serviços e valores).
export const revalidate = 60;

export default async function BriefingHome() {
  const cats = await listServices();
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#11101E] px-5 pb-20 pt-24 text-[#EDE6EC] md:pt-28">
      <PageBackdrop />
      <div className="relative z-10 mx-auto max-w-4xl">
        <Link href="/" className="text-[11px] uppercase tracking-[0.3em] text-white/45 hover:text-white">
          ← Voltar
        </Link>
        <p className="mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45">Orçamento · Escolha a categoria</p>
        <h1 className="font-display mt-3 text-4xl font-light leading-tight md:text-6xl">
          O que vamos <em className="kb-em">criar</em>?
        </h1>
        <p className="mt-4 max-w-xl text-[15px] font-light leading-relaxed text-white/60">
          Toque numa categoria para ver detalhes, cases reais e valores — depois,
          se fizer sentido, você preenche o briefing em 2 minutos.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {cats.map((c, i) => (
            <Link
              key={c.id}
              href={`/briefing/${c.id}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition active:scale-[0.985] hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.05] hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
            >
              <p className="text-[11px] tabular-nums tracking-[0.3em] text-white/35">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h2 className="font-display mt-2 text-2xl font-light">{c.label}</h2>
              <p className="mt-1 text-sm font-light italic text-[#B79BFF]">{c.tagline}</p>
              <p className="mt-1 text-sm font-light text-white/55">{c.desc}</p>
              <p className="mt-4 flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-[#B79BFF]">
                <span>{c.baseValue}{c.term ? ` · ${c.term}` : ""}</span>
                <span aria-hidden className="rounded-full border border-white/15 px-3 py-1 text-white/60 transition group-hover:border-white/50 group-hover:text-white">Ver detalhes →</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
