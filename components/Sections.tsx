"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ABOUT, TESTIMONIALS, PARTNERS, CONTACT, SOCIALS } from "@/lib/data";
import { goToSlide } from "@/components/Header";
import { LocalTime, useMagnetic } from "@/components/fx";
import { SocialIcon } from "@/components/SocialIcons";
import { useLang } from "@/components/Providers";

/* Setas em SVG (nunca unicode): render idêntico no mobile e no desktop,
   sem risco de virar emoji na fonte do sistema. */
function ArrowDiag({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
function ArrowRight({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* cursor VER PROJETO — círculo claro que substitui o cursor nativo.
   Segue o mouse com lerp rápido + pop elástico na entrada. */
function useViewCursor() {
  const cursor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cursor.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;
    gsap.set(el, { xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0, rotate: -8 });
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
function ViewCursor({ cursor }: { cursor: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={cursor} className="cursor-view" aria-hidden>
      <small>↗</small>
      <span>Ver projeto</span>
    </div>
  );
}
function bindCursor(cursor: React.RefObject<HTMLDivElement | null>) {
  return {
    onMouseEnter: () => {
      if (!cursor.current) return;
      cursor.current.classList.add("on");
      gsap.to(cursor.current, { scale: 1, opacity: 1, rotate: 0, duration: 0.45, ease: "back.out(1.6)", overwrite: "auto" });
    },
    onMouseLeave: () => {
      if (!cursor.current) return;
      gsap.to(cursor.current, {
        scale: 0.4,
        opacity: 0,
        rotate: -8,
        duration: 0.25,
        ease: "power3.in",
        overwrite: "auto",
        onComplete: () => cursor.current?.classList.remove("on"),
      });
    },
  };
}

const ABOUT_PHOTOS = [
  { src: "/assets/deco/ok1.webp", alt: "Bastidor — programando", fx: "zoom", tag: "Código" },
  { src: "/assets/deco/ok2.webp", alt: "Bastidor — direção", fx: "tilt", tag: "Direção" },
  { src: "/assets/deco/ok3.webp", alt: "Bastidor — teclado", fx: "slide", tag: "Setup" },
  { src: "/assets/deco/ok4.webp", alt: "Bastidor — set", fx: "pop", tag: "Set" },
];

/* ================= SOBRE — ref 2.png ================= */
export function AboutSlide() {
  const { t } = useLang();
  return (
    <section className="relative flex h-full flex-col justify-center overflow-hidden bg-[#0B0B1E]">
      <p className="fp-anim ref-eyebrow absolute left-1/2 top-[70px] -translate-x-1/2 whitespace-nowrap md:top-[72px]">
        {t("about.eyebrow")}
      </p>
      <div className="ref-inner">
        {/* mobile: texto compacto para caber em 100svh */}
        <p className="fp-anim text-[16px] font-light leading-[1.6] text-[#F4F1EC] md:hidden">
          <strong className="font-semibold">Tecnólogo Criativo</strong> especializado em
          converter <em className="italic">tecnologia em impacto visual.</em> Formado em
          Análise e Desenvolvimento de Sistemas, integro programação, design criativo e
          audiovisual para entregar soluções completas e escaláveis no ambiente digital.
        </p>
        {/* desktop: medida do ref */}
        <p
          className="fp-anim hidden font-light text-[#F4F1EC] md:block"
          style={{ fontSize: "clamp(24px, 2.05vw, 39px)", lineHeight: 1.55, fontWeight: 300 }}
        >
          <strong style={{ fontWeight: 600 }}>Tecnólogo Criativo</strong> especializado em
          converter <em className="font-light italic">tecnologia em impacto visual.</em>{" "}
          Formado em Análise e Desenvolvimento de Sistemas, integro programação,
          design criativo e audiovisual para entregar soluções completas e
          escaláveis no ambiente digital.
        </p>

        {/* collage escalonada — desktop (grade em fluxo: as 4 sempre cabem no slide) */}
        <div
          className="fp-anim no-save mt-[3vh] hidden grid-cols-12 items-start gap-[1.5vw] md:grid"
          style={{ height: "38vh" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="about-photo col-span-3" data-fx="zoom">
            <Image
              src="/assets/deco/ok1.webp"
              alt="Bastidor — programando"
              width={620}
              height={460}
              draggable={false}
              className="fp-layer h-[24vh] w-full object-cover"
            />
            <span className="about-tag">Código</span>
          </div>
          <div className="about-photo col-span-3 mt-[6vh]" data-fx="tilt">
            <Image
              src="/assets/deco/ok2.webp"
              alt="Bastidor — direção"
              width={560}
              height={700}
              draggable={false}
              className="fp-layer h-[29vh] w-full object-cover"
            />
            <span className="about-tag">Direção</span>
          </div>
          <div className="about-photo col-span-3 mt-[2vh]" data-fx="slide">
            <Image
              src="/assets/deco/ok3.webp"
              alt="Bastidor — teclado"
              width={620}
              height={460}
              draggable={false}
              className="fp-layer h-[24vh] w-full object-cover"
            />
            <span className="about-tag">Setup</span>
          </div>
          <div className="about-photo col-span-3 mt-[7vh]" data-fx="pop">
            <Image
              src="/assets/deco/ok4.webp"
              alt="Bastidor — set"
              width={560}
              height={700}
              draggable={false}
              className="fp-layer h-[29vh] w-full object-cover"
            />
            <span className="about-tag">Set</span>
          </div>
        </div>

        {/* mobile — grade 2×2 quadrada, cabe em 100svh */}
        <div className="no-save mt-5 grid grid-cols-2 gap-2 md:hidden" onContextMenu={(e) => e.preventDefault()}>
          {ABOUT_PHOTOS.map((p) => (
            <div key={p.src} className="about-photo" data-fx={p.fx}>
              <Image
                src={p.src}
                alt={p.alt}
                width={400}
                height={400}
                draggable={false}
                loading="lazy"
                className="fp-layer aspect-square w-full object-cover"
              />
              <span className="about-tag">{p.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= SERVIÇOS — ref 3.png ================= */
function ServiceThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="loop-media fp-layer h-[80px] sm:h-[100px] md:h-[clamp(120px,17vh,172px)]">
      <Image src={src} alt={alt} fill loading="lazy" className="object-cover" sizes="(max-width:768px) 40vw, 40vw" />
    </div>
  );
}

export function ServicesSlide() {
  const [preview, setPreview] = useState<string | null>(null);
  const prevBox = useRef<HTMLDivElement>(null);
  const prevImg = useRef<HTMLImageElement>(null);
  const { t } = useLang();
  useEffect(() => {
    const el = prevBox.current;
    if (!el) return;
    gsap.set(el, { xPercent: -50, yPercent: -58, scale: 0.8, rotate: -4, opacity: 0 });
    const qx = gsap.quickTo(el, "x", { duration: 0.5, ease: "expo.out" });
    const qy = gsap.quickTo(el, "y", { duration: 0.5, ease: "expo.out" });
    const move = (e: PointerEvent) => {
      qx(e.clientX);
      qy(e.clientY);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  useEffect(() => {
    const el = prevBox.current;
    if (!el) return;
    gsap.to(el, {
      scale: preview ? 1 : 0.8,
      rotate: preview ? 3 : -4,
      opacity: preview ? 1 : 0,
      duration: 0.45,
      ease: "expo.out",
      overwrite: "auto",
    });
    if (preview && prevImg.current) {
      gsap.fromTo(prevImg.current, { scale: 1.18 }, { scale: 1, duration: 0.6, ease: "expo.out", overwrite: "auto" });
    }
  }, [preview]);
  return (
    <section className="relative flex h-full flex-col justify-center overflow-hidden bg-[#0B0B1E]">
      <div ref={prevBox} className="pointer-events-none fixed left-0 top-0 z-40 hidden w-[300px] overflow-hidden md:block" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={prevImg}
          src={preview ?? "/assets/deco/ok2.webp"}
          alt=""
          className="aspect-[4/3] w-full object-cover"
        />
      </div>
      <p className="fp-anim ref-eyebrow absolute left-1/2 top-[70px] -translate-x-1/2 whitespace-nowrap md:top-[72px]">
        {t("services.eyebrow")}
      </p>

      <div className="ref-inner flex flex-col gap-5 md:gap-[clamp(20px,3.4vh,38px)]">
        <button onClick={() => goToSlide(3)} onMouseEnter={() => setPreview("/assets/deco/ok2.webp")} onMouseLeave={() => setPreview(null)} className="fp-anim group flex items-center gap-4 text-left md:gap-10">
          <h3 className="font-display flex-1 font-light text-white" style={{ fontSize: "clamp(30px, 9vw, 52px)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            <span className="md:hidden">Audio<br />visual</span>
            <span className="hidden md:block" style={{ fontSize: "clamp(58px, 6vw, 116px)", fontWeight: 300 }}>Audiovisual</span>
          </h3>
          <div className="w-[42%] transition group-hover:opacity-90 md:w-[38%]">
            <ServiceThumb src="/assets/deco/ok2.webp" alt="Audiovisual" />
          </div>
        </button>

        <button onClick={() => goToSlide(4)} onMouseEnter={() => setPreview("/assets/deco/21Ativo-1.webp")} onMouseLeave={() => setPreview(null)} className="fp-anim group flex items-center gap-4 text-left md:gap-10">
          <div className="w-[42%] transition group-hover:opacity-90 md:w-[54%]">
            <ServiceThumb src="/assets/deco/21Ativo-1.webp" alt="Dev" />
          </div>
          <h3 className="font-display flex-1 text-right font-light text-white" style={{ fontSize: "clamp(30px, 9vw, 52px)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            <span className="md:hidden">DEV</span>
            <span className="hidden md:block" style={{ fontSize: "clamp(58px, 6vw, 116px)", fontWeight: 300 }}>DEV</span>
          </h3>
        </button>

        <div className="fp-anim flex items-center gap-4 md:gap-10">
          <button onClick={() => goToSlide(5)} onMouseEnter={() => setPreview("/assets/deco/ok4.webp")} onMouseLeave={() => setPreview(null)} className="group flex flex-1 items-center gap-3 text-left md:gap-10">
            <h3 className="font-display flex-1 font-light text-white" style={{ fontSize: "clamp(30px, 9vw, 52px)", letterSpacing: "-0.02em", lineHeight: 1 }}>
              <span className="md:hidden">Brand<br />ing</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(58px, 6vw, 116px)", fontWeight: 300 }}>Branding</span>
            </h3>
            <span className="text-white transition duration-300 group-hover:translate-x-1 group-hover:translate-y-1">
              <ArrowDiag size={30} />
            </span>
          </button>
          <button onClick={() => goToSlide(5)} onMouseEnter={() => setPreview("/assets/deco/ok4.webp")} onMouseLeave={() => setPreview(null)} className="group w-[32%] text-left">
            <div className="transition group-hover:opacity-90">
              <ServiceThumb src="/assets/deco/ok4.webp" alt="Branding" />
            </div>
          </button>
        </div>
      </div>

      <div className="ref-inner">
        <button
          onClick={() => goToSlide(3)}
          className="fp-anim font-display mt-6 block w-full text-right font-light text-white transition hover:opacity-80 md:mt-[3vh]"
          style={{ fontSize: "clamp(20px, 5vw, 30px)", letterSpacing: "-0.01em" }}
        >
          <span className="hidden items-center justify-end gap-3 md:flex" style={{ fontSize: "clamp(34px, 2.8vw, 54px)" }}>{t("services.all")} <ArrowRight size={34} /></span>
          <span className="flex items-center justify-end gap-2 md:hidden">{t("services.all")} <ArrowRight size={20} /></span>
        </button>
      </div>
    </section>
  );
}

/* ================= PORTFÓLIO 1/3 — ref 4.png ================= */
export function AudiovisualSlide() {
  const cursor = useViewCursor();
  const b = bindCursor(cursor);
  return (
    <section className="relative flex h-full flex-col bg-[#0B0B1E] p-2 md:p-[18px]">
      <ViewCursor cursor={cursor} />
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-2 md:grid-cols-2 md:grid-rows-none md:gap-[10px]">
        <Link
          href="/trabalho/clau-amaral"
          {...b}
          className="proj-card fp-anim group relative block min-h-0 overflow-hidden bg-[#1a1a2e]"
        >
          <Image
            src="/assets/portfolio/klau-amaral-capa-2.webp"
            alt="Clau Amaral"
            fill
            loading="lazy"
            className="fp-layer reveal-img object-cover"
            sizes="(max-width:768px) 100vw, 50vw"
          />
          <div className="reveal-veil absolute inset-0" aria-hidden />
          <div className="reveal-info absolute inset-x-0 bottom-0 px-5 pb-5 text-center md:pb-10">
            <h3 className="font-display text-white" style={{ fontSize: "clamp(26px, 7vw, 34px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
              <span className="md:hidden">Clau Amaral</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(40px, 3.6vw, 68px)" }}>Clau Amaral</span>
            </h3>
            <p className="mt-1.5 text-white/55 md:mt-3" style={{ fontSize: 11, letterSpacing: "0.42em" }}>
              PRODUÇÃO AUDIOVISUAL
            </p>
          </div>
        </Link>
        <Link
          href="/trabalho/mana-fest"
          {...b}
          className="proj-card fp-anim group relative block min-h-0 overflow-hidden bg-[#14141f]"
        >
          <Image
            src="/assets/portfolio/manafest-capa.webp"
            alt="Mana Fest"
            fill
            loading="lazy"
            className="fp-layer reveal-img object-cover"
            sizes="(max-width:768px) 100vw, 50vw"
          />
          <div className="reveal-veil absolute inset-0" aria-hidden />
          <div className="reveal-info absolute inset-x-0 bottom-0 mx-auto max-w-[560px] px-5 pb-5 text-center md:pb-10">
            <h3 className="font-display text-white" style={{ fontSize: "clamp(26px, 7vw, 34px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
              <span className="md:hidden">Mana Fest</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(40px, 3.6vw, 68px)" }}>Mana Fest</span>
            </h3>
            <p className="mt-1.5 text-white/55 md:mt-3" style={{ fontSize: 11, letterSpacing: "0.42em" }}>
              PRODUÇÃO AUDIOVISUAL
            </p>
            <p className="mx-auto mt-3 hidden font-light leading-relaxed text-white/85 md:block" style={{ fontSize: "clamp(16px, 1.15vw, 21px)" }}>
              9 dias, um destino: Pipa (RN). Cobertura audiovisual completa unindo
              esporte, cultura e sustentabilidade em uma produção que capturou a
              essência de um dos maiores eventos da região.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}

/* ================= PORTFÓLIO 2/3 — ref 5.png ================= */
export function DevSlide() {
  const cursor = useViewCursor();
  const b = bindCursor(cursor);
  return (
    <section className="relative flex h-full flex-col gap-2 bg-[#0B0B1E] p-2 md:gap-[10px] md:p-[18px]">
      <ViewCursor cursor={cursor} />
      <Link
        href="/trabalho/plugbra"
        {...b}
        className="proj-card fp-anim group relative block min-h-0 flex-[1.2] overflow-hidden bg-[#2a2a30] md:h-[47%] md:flex-none"
      >
        <Image
          src="/assets/portfolio/PLUGBRA-CAPA-1.webp"
          alt="PlugBra"
          fill
          loading="lazy"
          className="fp-layer reveal-img object-cover"
          sizes="100vw"
        />
        <div className="reveal-veil absolute inset-0" aria-hidden />
        <div className="reveal-info absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <h3 className="font-display text-white" style={{ fontSize: "clamp(26px, 7.5vw, 36px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
            <span className="md:hidden">PlugBra</span>
            <span className="hidden md:block" style={{ fontSize: "clamp(44px, 4vw, 76px)" }}>PlugBra</span>
          </h3>
          <p className="mt-1.5 text-white/60 md:mt-3" style={{ fontSize: 11, letterSpacing: "0.5em" }}>
            LANDING PAGE
          </p>
          <p className="mt-2 hidden font-light text-white/85 md:block" style={{ fontSize: "clamp(17px, 1.3vw, 24px)" }}>
            Pagina de Vendas de Aplicativo
          </p>
        </div>
      </Link>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 md:gap-[10px]">
        <Link href="/trabalho/super-foods" {...b} className="proj-card fp-anim group relative block min-h-0 overflow-hidden bg-[#101014]">
          <Image
            src="/assets/portfolio/parasuperfoods-capa.webp"
            alt="Pará Super Foods"
            fill
            loading="lazy"
            className="reveal-img object-cover"
            sizes="(max-width:768px) 50vw, 50vw"
          />
          <div className="reveal-veil absolute inset-0" aria-hidden />
          <div className="reveal-info absolute inset-x-0 bottom-0 px-4 pb-4 md:pb-8 md:pl-10">
            <h3 className="font-display text-white" style={{ fontSize: "clamp(18px, 5.2vw, 26px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
              <span className="md:hidden">Pará Super Foods</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(36px, 3.2vw, 62px)" }}>Pará Super Foods</span>
            </h3>
            <p className="mt-1 text-white/55 md:mt-2" style={{ fontSize: 10, letterSpacing: "0.42em" }}>
              SITE
            </p>
          </div>
        </Link>
        <Link href="/trabalho/passos-imoveis" {...b} className="proj-card fp-anim group relative block min-h-0 overflow-hidden bg-[#e8e4dc]">
          <Image
            src="/assets/portfolio/passo-capa.webp"
            alt="Passo Imóveis"
            fill
            loading="lazy"
            className="reveal-img object-cover"
            sizes="(max-width:768px) 50vw, 50vw"
          />
          <div className="reveal-veil absolute inset-0" aria-hidden />
          <div className="reveal-info absolute inset-x-0 bottom-0 px-4 pb-4 md:pb-8 md:pl-10">
            <h3 className="font-display text-white" style={{ fontSize: "clamp(18px, 5.2vw, 26px)", fontWeight: 400, letterSpacing: "-0.02em", textShadow: "0 2px 24px rgba(0,0,0,0.45)" }}>
              <span className="md:hidden">Passo Imóveis</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(36px, 3.2vw, 62px)" }}>Passo Imóveis</span>
            </h3>
            <p className="mt-1 text-white/70 md:mt-2" style={{ fontSize: 10, letterSpacing: "0.42em" }}>
              SISTEMA WEB
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}

/* ================= PORTFÓLIO 3/3 — ref 6.png ================= */
export function BrandingSlide() {
  const cursor = useViewCursor();
  const b = bindCursor(cursor);
  return (
    <section className="relative flex h-full flex-col gap-2 bg-[#0B0B1E] p-2 md:grid md:grid-cols-2 md:gap-[10px] md:p-[18px]">
      <ViewCursor cursor={cursor} />
      <Link
        href="/trabalho/acai-norte-mix"
        {...b}
        className="proj-card fp-anim group relative block min-h-0 flex-1 overflow-hidden md:h-auto md:flex-none"
        style={{ background: "#3d0a4e" }}
      >
        <Image
          src="/assets/portfolio/acai-norte-mix-capa.webp"
          alt="Açaí Norte Mix"
          fill
          loading="lazy"
          className="fp-layer reveal-img object-contain p-[8%]"
          sizes="(max-width:768px) 100vw, 50vw"
        />
        <div className="reveal-veil absolute inset-0" aria-hidden />
        <div className="reveal-info absolute inset-x-0 bottom-0 px-5 pb-5 text-center md:pb-10">
          <h3 className="font-display text-white" style={{ fontSize: "clamp(24px, 7vw, 32px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
            <span className="md:hidden">Açaí Norte Mix</span>
            <span className="hidden md:block" style={{ fontSize: "clamp(40px, 3.4vw, 64px)" }}>Açaí Norte Mix</span>
          </h3>
          <p className="mt-1.5 text-white/50 md:mt-3" style={{ fontSize: 11, letterSpacing: "0.42em" }}>
            BRANDING
          </p>
        </div>
      </Link>
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:gap-[10px]">
        <Link
          href="/trabalho/comitiva-yovekene"
          {...b}
          className="proj-card fp-anim group relative block min-h-0 flex-1 overflow-hidden md:h-[66%] md:flex-none"
          style={{ background: "#26382f" }}
        >
          <Image
            src="/assets/portfolio/comitiva-yovekene-capa.webp"
            alt="Comitiva Yovekene"
            fill
            loading="lazy"
            className="fp-layer reveal-img object-contain p-[7%]"
            sizes="(max-width:768px) 100vw, 50vw"
          />
          <div className="reveal-veil absolute inset-0" aria-hidden />
          <div className="reveal-info absolute inset-x-0 bottom-0 px-5 pb-4 text-center md:pb-8">
            <h3 className="font-display text-white" style={{ fontSize: "clamp(22px, 6.5vw, 30px)", fontWeight: 400, letterSpacing: "-0.02em" }}>
              <span className="md:hidden">Comitiva Yovekene</span>
              <span className="hidden md:block" style={{ fontSize: "clamp(36px, 3vw, 58px)" }}>Comitiva Yovekene</span>
            </h3>
            <p className="mt-1.5 text-white/50 md:mt-3" style={{ fontSize: 11, letterSpacing: "0.42em" }}>
              BRANDING
            </p>
          </div>
        </Link>
        <Link
          href="/trabalho"
          className="fp-anim flex h-[60px] flex-none items-center justify-center rounded-lg bg-[#12122a] transition hover:bg-[#1a1a3a] md:h-auto md:flex-1 md:rounded-none"
        >
          <span className="font-light uppercase text-white" style={{ fontSize: "clamp(16px, 4.5vw, 22px)", letterSpacing: "0.02em" }}>
            <span className="flex items-center justify-center gap-2 md:hidden">Todos trabalhos <ArrowRight size={20} /></span>
            <span className="hidden items-center justify-center gap-3 md:flex" style={{ fontSize: "clamp(24px, 1.9vw, 36px)" }}>Todos trabalhos <ArrowRight size={30} /></span>
          </span>
        </Link>
      </div>
    </section>
  );
}

/* ================= DEPOIMENTOS — ref 7.png ================= */
export function TestimonialsSlide() {
  const { t } = useLang();
  return (
    <section className="relative flex h-full flex-col justify-center overflow-hidden bg-[#0B0B1E]">
      <div className="ref-inner">
        <p className="fp-anim ref-eyebrow" style={{ fontSize: 13 }}>{t("testimonials.eyebrow")}</p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:mt-[4vh] md:grid-cols-3 md:gap-10" style={{ columnGap: 80 }}>
          {TESTIMONIALS.map((testi) => (
            <div key={testi.name} className="fp-anim border-l border-white/10 pl-4 md:border-0 md:pl-0">
              <p className="font-light leading-snug text-[#F4F1EC] md:leading-relaxed" style={{ fontSize: "clamp(13.5px, 3.7vw, 17px)", lineHeight: 1.55 }}>
                <span className="md:hidden">{testi.quote}</span>
                <span className="hidden md:block" style={{ fontSize: "clamp(19px, 1.35vw, 25px)", lineHeight: 1.6 }}>{testi.quote}</span>
              </p>
              {/* autor: foto + nome/cargo + canais da empresa */}
              <div className="mt-3 flex items-center gap-3 md:mt-8">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/5 md:h-14 md:w-14">
                  {testi.photo ? (
                    <Image
                      src={testi.photo}
                      alt={testi.name}
                      fill
                      loading="lazy"
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <span className="text-[13px] font-semibold tracking-[0.08em] text-white md:text-[15px]" aria-hidden>
                      {initials(testi.name)}
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-white md:mt-0" style={{ fontSize: 16, fontWeight: 600 }}>
                    <span className="md:hidden">{testi.name}</span>
                    <span className="hidden md:block" style={{ fontSize: 23 }}>{testi.name}</span>
                  </span>
                  <span className="block truncate text-white/45" style={{ fontSize: 13, fontWeight: 300 }}>
                    <span className="md:hidden">{testi.role}</span>
                    <span className="hidden md:block" style={{ fontSize: 18 }}>{testi.role}</span>
                  </span>
                </span>
              </div>
              {(testi.companyLogo || testi.socials.length > 0) && (
                <div className="mt-2.5 flex items-center gap-3 pl-[56px] md:mt-3 md:pl-[68px]">
                  {testi.companyLogo && (
                    <Image
                      src={testi.companyLogo}
                      alt={testi.companyName}
                      width={120}
                      height={32}
                      loading="lazy"
                      className="h-5 w-auto object-contain brightness-0 invert opacity-80"
                    />
                  )}
                  {testi.socials.map((s) => (
                    s.href.startsWith("/") ? (
                      <Link
                        key={s.name}
                        href={s.href}
                        aria-label={`${s.name} — ${testi.companyName}`}
                        title={`${s.name} — ${testi.companyName}`}
                        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-[#9DB8E8] transition hover:text-white"
                      >
                        <SocialIcon icon={s.icon} size={15} />
                        <span className="hidden md:inline">{t("testimonials.case")}</span>
                      </Link>
                    ) : (
                      <a
                        key={s.name}
                        href={s.href}
                        target="_blank"
                        rel="noopener"
                        aria-label={`${s.name} — ${testi.companyName}`}
                        title={`${s.name} — ${testi.companyName}`}
                        className="text-[#9DB8E8] transition hover:text-white"
                      >
                        <SocialIcon icon={s.icon} size={16} />
                      </a>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="fp-anim mt-6 text-white/75 md:mt-[7vh]" style={{ fontSize: 12, letterSpacing: "0.28em" }}>
          {t("testimonials.partners").toUpperCase()}
        </p>
        {/* parceiros em loop infinito — carrossel lateral */}
        <div
          className="fp-anim mt-4 overflow-hidden md:mt-8"
          style={{
            maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
          }}
        >
          <div className="animate-marquee flex w-max items-center gap-10 pr-10 hover:[animation-play-state:paused] md:gap-[90px] md:pr-[90px]">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <Image
                key={`${p.name}-${i}`}
                src={p.img}
                alt={i < PARTNERS.length ? p.name : ""}
                aria-hidden={i >= PARTNERS.length}
                width={200}
                height={64}
                loading="lazy"
                draggable={false}
                className="h-6 w-auto shrink-0 select-none object-contain brightness-0 invert opacity-90 md:h-10"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= CONTATO — ref 8.png ================= */
export function ContactSlide() {
  const magContact = useMagnetic<HTMLAnchorElement>(0.35);
  const pulse = useRef<HTMLDivElement>(null);
  const { t } = useLang();
  useEffect(() => {
    if (!pulse.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tm = gsap.to(pulse.current, { scale: 1.06, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
    return () => { tm.kill(); };
  }, []);
  return (
    <section className="relative flex h-full flex-col justify-center overflow-hidden bg-[#0B0B1E]">
      {/* aurora de fundo do contato */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#9DB8E8]/10 blur-[120px]" />
      <div className="ref-inner relative">
        <h2
          className="fp-anim font-display font-light text-white"
          style={{ fontSize: "clamp(30px, 8.5vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.08 }}
        >
          <span className="md:hidden">{t("contact.title")}</span>
          <span className="hidden md:block" style={{ fontSize: "clamp(48px, 4.6vw, 88px)", lineHeight: 1.05 }}>{t("contact.title")}</span>
        </h2>

        <div className="mt-5 flex flex-col gap-5 md:mt-[5vh] md:flex-row md:items-center md:justify-between md:gap-10">
          <p className="fp-anim max-w-[600px] font-light text-white/70" style={{ fontSize: "clamp(14px, 3.8vw, 17px)", lineHeight: 1.65 }}>
            <span className="md:hidden">{t("contact.text")}</span>
            <span className="hidden md:block" style={{ fontSize: 23 }}>{t("contact.text")}</span>
          </p>
          {/* foto circular — visível no mobile e no desktop */}
          <div className="fp-anim relative mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-full border border-white/20 md:mx-0 md:h-[280px] md:w-[280px]">
            <Image
              src="/assets/deco/ok2.webp"
              alt="Kayque Brito"
              fill
              loading="lazy"
              className="fp-layer object-cover"
              sizes="(max-width:768px) 112px, 280px"
            />
          </div>
        </div>

        <div className="fp-anim my-6 h-px w-full bg-white/15 md:my-[3vh]" aria-hidden />

        <div className="fp-anim flex flex-col gap-5 md:flex-row md:flex-wrap md:items-center md:gap-12">
          <div ref={pulse}>
          <Link
            ref={magContact as unknown as React.RefObject<HTMLAnchorElement>}
            href="/briefing"
            className="relative flex h-[60px] w-full items-center justify-center overflow-hidden rounded-full border border-white/80 px-10 text-center text-[18px] font-light text-[#9DB8E8] transition hover:bg-white hover:text-[#0B0B1E] md:h-[76px] md:min-w-[320px]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent" style={{ animation: "ctaSweep 3.2s ease-in-out infinite" }} />
            <span className="relative md:text-[22px]">{t("contact.cta")}</span>
          </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[#9DB8E8] md:gap-4">
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener"
                aria-label={s.name}
                title={s.name}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition hover:border-white/60 hover:text-white"
              >
                <SocialIcon icon={s.icon} size={18} />
              </a>
            ))}
          </div>
        </div>

        <div className="fp-anim mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] font-light text-[#9DB8E8] md:mt-[6vh] md:justify-between">
          <span className="text-white/80">© Kayque Brito</span>
          <span>Belém — <LocalTime /></span>
          <span>2026</span>
        </div>
      </div>
      <p className="hidden">{ABOUT.name} {CONTACT.title}</p>
    </section>
  );
}
