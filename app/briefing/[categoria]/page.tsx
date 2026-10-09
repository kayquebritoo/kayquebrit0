import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRIEFING_CATEGORIES, getCategory } from "@/lib/kbos/briefing-forms";
import { PROJECTS } from "@/lib/data";
import CategoryAnim from "./CategoryAnim";

export async function generateStaticParams() {
  return BRIEFING_CATEGORIES.map((c) => ({ categoria: c.id }));
}

export function generateMetadata({ params }: { params: Promise<{ categoria: string }> }) {
  return params.then(({ categoria }) => {
    const c = getCategory(categoria);
    return {
      title: c ? `${c.label} — Orçamento` : "Categoria — Kayque Brito",
      description: c?.tagline ?? "",
    };
  });
}

export default async function CategoriaDetail({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const cat = getCategory(categoria);
  if (!cat) notFound();

  const related = PROJECTS.filter((p) => cat.portfolioService.includes(p.service));
  const others = BRIEFING_CATEGORIES.filter((c) => c.id !== cat.id).slice(0, 3);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0B1E] text-[#F4F1EC]">
      <CategoryAnim />
      {/* glow de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{ background: "radial-gradient(70% 90% at 50% 0%, rgba(157,184,232,0.16), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-[1280px] px-5 pb-24 pt-24 sm:px-8 md:px-14 md:pt-32">
        <div className="cat-in flex items-center justify-between gap-4">
          <Link href="/briefing" className="text-[11px] uppercase tracking-[0.3em] text-white/45 transition hover:text-white">
            ← Categorias
          </Link>
          <span className="cat-float rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-white/70 backdrop-blur">
            {cat.baseValue}
          </span>
        </div>

        <p className="cat-in mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45">
          Orçamento · {cat.label}
        </p>
        <h1
          className="cat-in font-display mt-3 font-light leading-[0.95] text-white"
          style={{ fontSize: "clamp(44px, 10vw, 96px)", letterSpacing: "-0.03em" }}
        >
          {cat.label}
          <br />
          <em className="font-light italic text-[#9DB8E8]" style={{ fontSize: "clamp(20px, 4.5vw, 40px)", letterSpacing: "-0.01em" }}>
            {cat.tagline}
          </em>
        </h1>
        <p className="cat-in mt-4 text-[15px] font-light text-white/60 md:text-lg">{cat.desc}</p>

        {/* capa */}
        <div className="cat-in relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#131316] md:rounded-3xl">
          <Image
            src={cat.cover}
            alt={cat.label}
            width={1600}
            height={800}
            priority
            className="cat-cover aspect-[16/10] w-full object-cover sm:aspect-[21/9]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5 md:p-8">
            <p className="max-w-xl text-[14px] font-light leading-relaxed text-white/85 md:text-[16px]">
              {cat.pitch[0]}
            </p>
            <Link
              href={`/briefing/${cat.id}/orcamento`}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-white px-8 py-3.5 text-[13px] font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.03]"
            >
              <span aria-hidden className="cat-cta-shine pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#9DB8E8]/60 to-transparent" />
              <span className="relative">Eu quero {cat.label.toLowerCase()} →</span>
            </Link>
          </div>
        </div>

        {/* sobre a categoria */}
        <div className="mt-12 grid gap-8 md:mt-16 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <div>
            <p className="cat-in text-[11px] uppercase tracking-[0.32em] text-white/40">Como eu trabalho</p>
            <h2 className="cat-in font-display mt-3 text-3xl font-light leading-tight md:text-4xl">
              Sobre esse
              <br />
              serviço
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
              {cat.bullets.map((b) => (
                <p key={b} className="cat-in flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[14px] font-light text-white/80">
                  <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#9DB8E8]/15 text-[13px] text-[#9DB8E8]">✓</span>
                  {b}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-5 text-[15px] font-light leading-relaxed text-white/65 md:text-base">
            {cat.pitch.map((p) => (
              <p key={p.slice(0, 24)} className="cat-in">{p}</p>
            ))}
            <div className="cat-in grid gap-3 pt-2 sm:grid-cols-3">
              {cat.process.map((s, i) => (
                <div key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <p className="text-[11px] tabular-nums tracking-[0.3em] text-[#9DB8E8]">0{i + 1}</p>
                  <p className="font-display mt-2 text-lg font-light text-white">{s.title}</p>
                  <p className="mt-1.5 text-[13px] font-light leading-relaxed text-white/55">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* portfolio da categoria */}
        <div className="mt-14 md:mt-20">
          <div className="cat-in flex items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-light md:text-4xl">
              Projetos de <em className="italic text-[#9DB8E8]">{cat.label.toLowerCase()}</em>
            </h2>
            <span className="text-[11px] uppercase tracking-[0.28em] text-white/35">
              {related.length} {related.length === 1 ? "projeto" : "projetos"}
            </span>
          </div>
          {related.length === 0 ? (
            <p className="cat-in mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-[14px] font-light text-white/60">
              Em breve novos cases aqui — mas já dá pra começar o seu pelo botão “Eu quero”.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:gap-5 md:grid-cols-2 md:gap-6">
              {related.map((p) => (
                <Link
                  key={p.slug}
                  href={`/trabalho/${p.slug}`}
                  className="cat-in work-card group relative overflow-hidden rounded-2xl border border-white/10 bg-[#131316] transition hover:border-white/25"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image src={p.img} alt={p.title} fill loading="lazy" className="object-cover transition duration-700 group-hover:scale-105" sizes="(max-width:768px) 100vw, 45vw" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    <span className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/45 px-3.5 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/85 backdrop-blur">
                      {p.category}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 p-6 text-left">
                      <h3 className="font-display text-2xl font-bold leading-tight md:text-3xl">{p.title}</h3>
                      <p className="mt-2 max-w-md text-sm font-light leading-relaxed text-white/65">{p.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* CTA formulário */}
          <div className="cat-in relative mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center backdrop-blur md:py-16">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 50% 100%, rgba(157,184,232,0.18), transparent 70%)" }} />
            <p className="relative text-[11px] uppercase tracking-[0.32em] text-white/40">Pronto quando você estiver</p>
            <h3 className="font-display relative mx-auto mt-4 max-w-2xl text-balance text-3xl font-light leading-tight md:text-5xl">
              Quer um orçamento de <em className="italic text-[#9DB8E8]">{cat.label.toLowerCase()}</em>?
            </h3>
            <p className="relative mx-auto mt-4 max-w-xl text-[14px] font-light leading-relaxed text-white/55">
              Leva 2 minutos. Suas respostas viram a base do orçamento e do contrato.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={`/briefing/${cat.id}/orcamento`}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-10 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.03] sm:w-auto"
              >
                <span aria-hidden className="cat-cta-shine pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#9DB8E8]/60 to-transparent" />
                <span className="relative">Eu quero →</span>
              </Link>
            </div>
          </div>

          {/* outras categorias */}
          <div className="cat-in mt-10 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">Ou explore outra categoria</p>
            <div className="flex flex-wrap gap-2">
              {others.map((o) => (
                <Link key={o.id} href={`/briefing/${o.id}`} className="rounded-full border border-white/15 px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-white/60 transition hover:border-white/40 hover:text-white">
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
