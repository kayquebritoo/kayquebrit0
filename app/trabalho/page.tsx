"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { PROJECTS, WHATSAPP } from "@/lib/data";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "audiovisual", label: "Audiovisual" },
  { id: "dev", label: "Dev" },
  { id: "branding", label: "Branding" },
];

function useViewCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cursor.current;
    if (!el || window.matchMedia("(hover: none)").matches) return;
    gsap.set(el, { xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0 });
    const qx = gsap.quickTo(el, "x", { duration: 0.22, ease: "expo.out" });
    const qy = gsap.quickTo(el, "y", { duration: 0.22, ease: "expo.out" });
    const move = (e: PointerEvent) => {
      qx(e.clientX);
      qy(e.clientY);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return cursor;
}

export default function WorksPage() {
  const [filter, setFilter] = useState("all");
  const cursor = useViewCursor();
  const gridRef = useRef<HTMLDivElement>(null);
  const list = PROJECTS.filter((p) => filter === "all" || p.service === filter);

  const showCursor = () => {
    if (!cursor.current) return;
    gsap.to(cursor.current, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.6)", overwrite: "auto" });
  };
  const hideCursor = () => {
    if (!cursor.current) return;
    gsap.to(cursor.current, { scale: 0.4, opacity: 0, duration: 0.25, ease: "power3.in", overwrite: "auto" });
  };

  // transição suave ao filtrar
  useEffect(() => {
    if (!gridRef.current) return;
    gsap.fromTo(
      gridRef.current.children,
      { y: 26, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.06, duration: 0.55, ease: "expo.out", overwrite: "auto", clearProps: "transform" }
    );
  }, [filter]);

  return (
    <main className="min-h-screen bg-[#0B0B1E] text-[#F4F1EC]">
      {/* cursor ver projeto */}
      <div ref={cursor} className="cursor-view" aria-hidden>
        <small>↗</small>
        <span>Ver projeto</span>
      </div>

      {/* HERO editorial */}
      <div className="single-hero-glow px-5 pb-8 pt-24 sm:px-8 sm:pt-28 md:px-14 md:pt-36">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-[11px] uppercase tracking-[0.3em] text-white/45 transition hover:text-white"
            >
              ← Voltar
            </Link>
            <span className="rounded-full border border-white/15 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-white/50">
              {list.length} {list.length === 1 ? "projeto" : "projetos"}
            </span>
          </div>
          <p className="mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45">
            Portfólio — 2018 / 2026
          </p>
          <h1
            className="font-display mt-3 font-light leading-[0.95] text-white"
            style={{ fontSize: "clamp(44px, 11vw, 96px)", letterSpacing: "-0.03em" }}
          >
            Todos os
            <br />
            <em className="font-light italic text-[#9DB8E8]">trabalhos</em>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] font-light leading-relaxed text-white/60">
            Uma seleção de projetos em audiovisual, desenvolvimento e branding —
            cada um com conceito, processo e resultado.
          </p>

          {/* filtros */}
          <div className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const n = f.id === "all" ? PROJECTS.length : PROJECTS.filter((p) => p.service === f.id).length;
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-2 rounded-full border px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] transition-all duration-300 ${
                    active
                      ? "border-white bg-white text-black shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)]"
                      : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums ${active ? "text-black/50" : "text-white/30"}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* GRADE */}
      <div className="mx-auto max-w-[1280px] px-5 pb-16 sm:px-8 md:px-14 md:pb-24">
        <div ref={gridRef} className="mt-8 grid gap-4 sm:gap-5 md:mt-10 md:grid-cols-2 md:gap-6">
          {list.map((p, i) => (
            <Link
              key={p.slug}
              href={`/trabalho/${p.slug}`}
              onMouseEnter={showCursor}
              onMouseLeave={hideCursor}
              className="work-card proj-card group relative overflow-hidden rounded-2xl border border-white/10 bg-[#131316] hover:border-white/25"
            >
              <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[16/10]">
                <Image
                  src={p.img}
                  alt={p.title}
                  fill
                  loading={i < 2 ? "eager" : "lazy"}
                  className="object-cover"
                  sizes="(max-width:768px) 100vw, 45vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                <span className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/45 px-3.5 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/85 backdrop-blur">
                  {p.category}
                </span>
                <span className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black opacity-0 transition-all duration-300 group-hover:opacity-100">
                  ↗
                </span>
                <div className="absolute inset-x-0 bottom-0 p-6 text-left md:p-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="font-display text-[11px] uppercase tracking-[0.3em] text-white/45">
                        {String(i + 1).padStart(2, "0")} — {p.year}
                      </p>
                      <h2 className="font-display mt-2 text-2xl font-bold leading-tight md:text-3xl">
                        {p.title}
                      </h2>
                    </div>
                  </div>
                  <p className="mt-2 max-w-md text-sm font-light leading-relaxed text-white/65">
                    {p.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA final */}
        <div className="mt-14 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center backdrop-blur sm:px-10 md:mt-20 md:py-16">
          <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">
            Tem um projeto em mente?
          </p>
          <h3 className="font-display mx-auto mt-4 max-w-2xl text-balance text-3xl font-light leading-tight md:text-5xl">
            Vamos criar algo <em className="italic text-[#9DB8E8]">incrível</em> juntos?
          </h3>
          <a
            href={WHATSAPP}
            target="_blank"
            className="mt-8 inline-block rounded-full bg-white px-10 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.03] md:px-12"
          >
            Iniciar conversa
          </a>
        </div>
      </div>
    </main>
  );
}
