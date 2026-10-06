"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { goToSlide } from "@/components/Header";
import { SplitChars, useMagnetic } from "@/components/fx";

/* Ondas tecnológicas orgânicas — fluxo contínuo e ininterrupto.
   Camadas senoidais sobrepostas + deriva que reage ao cursor sem nunca parar. */
export function PanelWaves() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const isMobile = window.innerWidth < 768;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / Math.max(1, r.width);
      mouse.ty = (e.clientY - r.top) / Math.max(1, r.height);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let t = Math.random() * 100;
    const lines = isMobile ? 16 : 26;
    const step = isMobile ? 9 : 7;
    // fluxo contínuo: nunca zera, nunca pausa — só desacelera com reduced-motion
    const draw = () => {
      t += RM ? 0.003 : 0.014;
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < lines; i++) {
        const p = i / (lines - 1);
        const yBase = h * 0.1 + p * h * 0.9;
        // respiração orgânica: amplitude cresce com a profundidade
        const amp = 6 + p * 34 + Math.sin(t * 0.7 + p * 4) * 6 + Math.abs(mouse.y - 0.5) * 60;
        const speed = 1.0 + p * 0.9;
        ctx.beginPath();
        for (let x = 0; x <= w; x += step) {
          const nx = x / w;
          // onda longa (maré) + onda curta (tecnologia) + ondulação fina
          const tide = Math.sin(nx * 4.2 + t * speed + p * 3.1) * amp * 0.42;
          const tech = Math.sin(nx * 11.5 - t * (1.6 + p * 0.8) + p * 6.0) * amp * 0.16;
          const ripple = Math.sin(nx * 23 + t * 2.2 + i * 0.7) * amp * 0.05;
          // reage ao cursor como campo magnético suave
          const react =
            Math.exp(-Math.pow((nx - mouse.x) * 3.2, 2)) * (mouse.y - 0.5) * 70;
          const y = yBase + tide + tech + ripple + react;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        // brilho cresce nas cristas (linhas de baixo = frente)
        const alpha = 0.08 + p * 0.18;
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = p > 0.82 ? 1.4 : 1;
        ctx.stroke();
      }
      // fio especular da crista — desliza sem interrupção
      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        const nx = x / w;
        const y =
          h * 0.1 +
          Math.sin(nx * 4.2 + t * 1.9) * 10 +
          Math.sin(nx * 11.5 - t * 2.4) * 4;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}

export default function HeroSlide() {
  const root = useRef<HTMLElement>(null);
  const magBadge = useMagnetic<HTMLButtonElement>(0.45);

  // reveal por caractere — dispara direto na montagem (sem preloader)
  useEffect(() => {
    const t = setTimeout(() => {
      gsap.fromTo(
        root.current?.querySelectorAll(".hero-char") ?? [],
        { yPercent: 120 },
        {
          yPercent: 0,
          stagger: 0.032,
          duration: 1.1,
          ease: "expo.out",
          delay: 0.15,
          overwrite: "auto",
        }
      );
    }, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // parallax só em desktop com cursor fino — economiza bateria no mobile
    if (window.matchMedia("(hover: none)").matches) return;
    const el = root.current;
    if (!el) return;
    const person = el.querySelector(".hero-person");
    const title = el.querySelector(".hero-title");
    const qx = gsap.quickTo(person, "x", { duration: 0.7, ease: "power3.out" });
    const tx = gsap.quickTo(title, "x", { duration: 0.7, ease: "power3.out" });
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      qx(nx * 16);
      tx(nx * -12);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <section ref={root} className="relative h-[100svh] overflow-hidden bg-[#0B0B1E]">
      {/* ============ MOBILE: coluna única — tudo cabe na 1ª sessão ============ */}
      <div className="flex h-full flex-col px-5 pb-3 pt-[74px] md:hidden">
        <p className="m-hero-in text-[13px] font-light leading-snug text-[#F4F1EC]">
          Produtor Audiovisual &
          <br />
          Desenvolvedor Full Stack
        </p>
        <h1 className="mt-2">
          <span
            className="m-hero-in font-display block font-light text-white"
            style={{ fontSize: "clamp(30px, 8.5vw, 40px)", lineHeight: 1.02, letterSpacing: "-0.02em" }}
          >
            Tecnólogo
          </span>
          <span
            className="m-hero-in font-display block font-light text-white"
            style={{ fontSize: "clamp(58px, 17.5vw, 88px)", lineHeight: 0.95, letterSpacing: "-0.03em" }}
          >
            Criativo
          </span>
        </h1>

        {/* foto em destaque sobre o painel de ondas (área flexível) */}
        <div className="fp-anim relative mt-2 min-h-0 flex-1">
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, #b3c4dc 0%, #93a8c6 32%, #758cad 62%, #5f789c 100%)",
              }}
            />
            <svg
              className="absolute -top-1 left-0 w-full"
              viewBox="0 0 1200 60"
              preserveAspectRatio="none"
              style={{ height: 36 }}
              aria-hidden
            >
              <polygon
                points="0,60 60,42 140,48 230,30 320,44 420,22 520,40 640,18 760,38 880,26 980,40 1080,24 1200,38 1200,0 0,0"
                fill="#0B0B1E"
              />
            </svg>
            <PanelWaves />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B1E]/30 via-transparent to-transparent" />
          </div>
          <Image
            src="/assets/hero/kayque.png"
            alt="Kayque Brito"
            fill
            priority
            className="fp-layer object-contain object-bottom"
            sizes="100vw"
          />
        </div>

        {/* ORÇAMENTO abre o briefing (fluxo de orçamento) */}
        <Link
          href="/briefing"
          className="m-hero-in mt-3 flex h-[52px] w-full shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/90 text-[15px] uppercase text-white transition active:bg-white active:text-[#0B0B1E]"
          style={{ letterSpacing: "0.12em" }}
        >
          Orçamento
        </Link>
        <p className="m-hero-in mt-2 shrink-0 text-[12px] font-light text-white/70">
          Escalando marcas através de design e tecnologia
        </p>
      </div>

      {/* ============ DESKTOP: composição absoluta ref 1.png ============ */}
      {/* painel de ondas */}
      <div className="fp-layer absolute bottom-0 left-[8%] right-[8%] top-[36%] hidden overflow-hidden md:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #b3c4dc 0%, #93a8c6 32%, #758cad 62%, #5f789c 100%)",
          }}
        />
        {/* corpo facetado da mesh */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1200 620"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon points="0,180 140,120 260,160 0,260" fill="#8fa3c2" opacity="0.55" />
          <polygon points="140,120 320,90 420,150 260,160" fill="#a7b8d2" opacity="0.6" />
          <polygon points="320,90 520,130 420,150" fill="#c2cede" opacity="0.5" />
          <polygon points="420,150 520,130 640,170 560,220 380,210" fill="#93a7c4" opacity="0.55" />
          <polygon points="520,130 740,80 820,150 640,170" fill="#b9c7dc" opacity="0.55" />
          <polygon points="740,80 980,120 820,150" fill="#cdd7e8" opacity="0.5" />
          <polygon points="820,150 980,120 1080,170 940,210 700,200 640,170" fill="#8fa3c2" opacity="0.5" />
          <polygon points="980,120 1200,100 1200,200 1080,170" fill="#aebdd4" opacity="0.55" />
          <polygon points="0,260 260,160 380,210 200,300 0,340" fill="#7e93b5" opacity="0.5" />
          <polygon points="380,210 560,220 700,200 620,300 360,320 200,300" fill="#8699b9" opacity="0.5" />
          <polygon points="700,200 940,210 1080,170 1200,200 1200,330 900,330 620,300" fill="#7c90b3" opacity="0.5" />
        </svg>
        {/* cumeeira facetada do topo + fio especular */}
        <svg
          className="absolute -top-1 left-0 w-full"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          style={{ height: 54 }}
          aria-hidden
        >
          <polygon
            points="0,60 60,42 140,48 230,30 320,44 420,22 520,40 640,18 760,38 880,26 980,40 1080,24 1200,38 1200,0 0,0"
            fill="#0B0B1E"
          />
        </svg>
        <svg
          className="absolute left-0 w-full"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          style={{ height: 54, top: 50 }}
          aria-hidden
        >
          <polyline
            points="0,58 60,40 140,46 230,28 320,42 420,20 520,38 640,16 760,36 880,24 980,38 1080,22 1200,36"
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1.6"
          />
        </svg>
        <PanelWaves />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B1E]/25 via-transparent to-transparent" />
      </div>

      {/* pessoa em recorte — desktop 44vw */}
      <div className="hero-person absolute bottom-0 right-[5%] top-[12%] z-[5] hidden w-[min(44vw,640px)] md:block">
        <div className="absolute inset-0 h-full w-full">
          <Image
            src="/assets/hero/kayque.png"
            alt="Kayque Brito"
            fill
            priority
            fetchPriority="high"
            className="fp-layer object-contain object-bottom"
            sizes="(max-width: 768px) 76vw, 44vw"
          />
        </div>
        {/* badge orbital — só desktop */}
        <span className="fp-anim absolute -left-10 top-[4%] z-20 hidden lg:block">
          <button
            ref={magBadge}
            onClick={() => goToSlide(1)}
            aria-label="Rolar para a próxima seção"
            className="flex h-[124px] w-[124px] items-center justify-center rounded-full border border-white/20 bg-[#0B0B1E]/60 text-white/80 backdrop-blur-md transition-colors hover:border-white/60 hover:text-white"
          >
            <svg viewBox="0 0 120 120" className="animate-spin-slow absolute inset-0 h-full w-full p-2" aria-hidden>
              <defs>
                <path id="kb-circle" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
              </defs>
              <text style={{ fontSize: 11, letterSpacing: 2.4 }} fill="currentColor">
                <textPath href="#kb-circle">DISPONÍVEL • PARA PROJETOS •</textPath>
              </text>
            </svg>
            <span className="text-xl leading-none">↓</span>
          </button>
        </span>
      </div>

      {/* bloco tipográfico — ref 1.png */}
      <div className="hero-title absolute left-[24%] top-[27%] z-10 hidden max-w-[60%] md:block">
        <p
          className="fp-anim font-light text-[#F4F1EC]"
          style={{ fontSize: "clamp(20px, 1.6vw, 30px)", lineHeight: 1.35 }}
        >
          Produtor Audiovisual &
          <br />
          Desenvolvedor Full Stack
        </p>
        <h1 className="mt-[4vh]">
          <span
            className="fp-anim font-display block overflow-hidden font-light text-white"
            style={{
              fontSize: "clamp(56px, 5.2vw, 100px)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
            }}
          >
            <SplitChars text="Tecnólogo" />
          </span>
          <span
            className="fp-anim font-display block overflow-hidden font-light text-white"
            style={{
              fontSize: "clamp(110px, 11vw, 210px)",
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
            }}
          >
            <SplitChars text="Criativo" />
          </span>
        </h1>
      </div>

      {/* barra inferior — pill ORÇAMENTO (magnética) abre o briefing + placa escura */}
      <div className="fp-anim absolute bottom-[5vh] left-[24%] z-10 hidden md:block">
        <Link
          href="/briefing"
          className="flex items-center justify-center rounded-full border-[1.5px] border-white/90 text-white transition hover:bg-white hover:text-[#0B0B1E]"
          style={{
            width: "min(24vw, 470px)",
            height: 68,
            fontSize: 20,
            letterSpacing: "0.12em",
            fontWeight: 400,
          }}
        >
          ORÇAMENTO
        </Link>
      </div>
      <div
        className="absolute bottom-0 right-[9%] z-10 hidden items-center rounded-tl-[24px] bg-[#0B0B1E] pl-14 pr-10 md:flex"
        style={{ width: "min(37vw, 700px)", height: 140 }}
      >
        <p
          className="fp-anim font-light text-[#F4F1EC]"
          style={{ fontSize: "clamp(17px, 1.25vw, 23px)", lineHeight: 1.5 }}
        >
          Escalando marcas através de design e tecnologia
        </p>
      </div>

      {/* atalho invisível para o slide sobre */}
      <button
        onClick={() => goToSlide(1)}
        className="absolute inset-x-0 bottom-0 z-0 hidden h-10 md:block"
        aria-label="Próxima seção"
        tabIndex={-1}
      />
    </section>
  );
}
