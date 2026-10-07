"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { goToSlide } from "@/components/Header";
import { SplitChars, useMagnetic } from "@/components/fx";

/* Ondas tecnológicas orgânicas — fluxo contínuo e ininterrupto.
   Camadas senoidais sobrepostas + deriva que reage ao cursor sem nunca parar.
   `subtle` reduz alfa para o hero mobile translúcido. */
export function PanelWaves({ subtle = false }: { subtle?: boolean }) {
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
    const lines = isMobile ? 14 : 26;
    const step = isMobile ? 10 : 7;
    const draw = () => {
      t += RM ? 0.003 : 0.014;
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < lines; i++) {
        const p = i / (lines - 1);
        const yBase = h * 0.1 + p * h * 0.9;
        const amp = 6 + p * 34 + Math.sin(t * 0.7 + p * 4) * 6 + Math.abs(mouse.y - 0.5) * 60;
        const speed = 1.0 + p * 0.9;
        ctx.beginPath();
        for (let x = 0; x <= w; x += step) {
          const nx = x / w;
          const tide = Math.sin(nx * 4.2 + t * speed + p * 3.1) * amp * 0.42;
          const tech = Math.sin(nx * 11.5 - t * (1.6 + p * 0.8) + p * 6.0) * amp * 0.16;
          const ripple = Math.sin(nx * 23 + t * 2.2 + i * 0.7) * amp * 0.05;
          const react =
            Math.exp(-Math.pow((nx - mouse.x) * 3.2, 2)) * (mouse.y - 0.5) * 70;
          const y = yBase + tide + tech + ripple + react;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = (subtle ? 0.04 : 0.08) + p * (subtle ? 0.09 : 0.18);
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = p > 0.82 ? 1.4 : 1;
        ctx.stroke();
      }
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
      ctx.strokeStyle = subtle ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.35)";
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
  }, [subtle]);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}

/* Borda fluida do topo — duas ondas sobrepostas em movimento perpétuo (sobem e descem).
   Substitui o polígono reto: nunca há linha dura. */
function FluidTop({ tint = "#0B0B1E" }: { tint?: string }) {
  const a = useRef<SVGPathElement>(null);
  const b = useRef<SVGPathElement>(null);
  useEffect(() => {
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (RM) return;
    const ctx = gsap.context(() => {
      gsap.to(a.current, { y: 9, duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(b.current, { y: -7, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.4 });
      // respiro horizontal sutil — a borda "respira"
      gsap.to([a.current, b.current], { scaleX: 1.02, transformOrigin: "50% 50%", duration: 4.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
    });
    return () => ctx.revert();
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute -top-1 left-0 w-full overflow-visible" style={{ height: 46 }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 46" preserveAspectRatio="none">
        <path
          ref={b}
          d="M0,26 C120,10 220,38 340,22 C460,6 560,36 690,20 C820,4 920,34 1040,20 C1100,13 1150,22 1200,16 L1200,0 L0,0 Z"
          fill={tint}
          opacity={0.55}
        />
        <path
          ref={a}
          d="M0,30 C140,16 260,40 380,26 C500,12 600,40 730,24 C860,8 960,38 1080,24 C1130,18 1170,26 1200,22 L1200,0 L0,0 Z"
          fill={tint}
        />
      </svg>
    </div>
  );
}

export default function HeroSlide() {
  const root = useRef<HTMLElement>(null);
  const magBadge = useMagnetic<HTMLButtonElement>(0.45);
  const magCta = useMagnetic<HTMLAnchorElement>(0.3);
  const magCtaM = useMagnetic<HTMLAnchorElement>(0.25);

  // reveal por caractere + loops ambientes (desktop e mobile)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      // entrada cinematográfica dos chars
      gsap.fromTo(
        el.querySelectorAll(".hero-char"),
        { yPercent: 120, rotate: 4 },
        { yPercent: 0, rotate: 0, stagger: 0.032, duration: 1.1, ease: "expo.out", delay: 0.15, overwrite: "auto" }
      );
      if (RM) return;
      // flutuação perpétua da pessoa (respiro)
      gsap.to(el.querySelectorAll(".hero-person-float"), {
        y: -12,
        duration: 2.8,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      // auroras do desktop deslizando sem parar
      gsap.to(el.querySelectorAll(".hero-aurora-a"), {
        x: 60, y: -30, scale: 1.12, duration: 7, ease: "sine.inOut", yoyo: true, repeat: -1,
      });
      gsap.to(el.querySelectorAll(".hero-aurora-b"), {
        x: -50, y: 26, scale: 1.08, duration: 8.5, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 0.6,
      });
      // brilho varrendo os CTAs em loop (efeito premium do GSAP explore)
      gsap.fromTo(
        el.querySelectorAll(".hero-cta-shine"),
        { xPercent: -160 },
        { xPercent: 280, duration: 2.8, ease: "power2.inOut", repeat: -1, repeatDelay: 1.6 }
      );
      // badge orbital: pop elástico na entrada
      gsap.fromTo(
        el.querySelectorAll(".hero-badge"),
        { scale: 0, rotate: -30 },
        { scale: 1, rotate: 0, duration: 1.1, ease: "back.out(1.7)", delay: 0.7 }
      );
      // ondas fluidas do mobile: sobem e descem sem parar
      gsap.to(el.querySelectorAll(".hero-fluid-panel"), {
        y: -6,
        duration: 3.2,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const el = root.current;
    if (!el) return;
    const person = el.querySelector(".hero-person");
    const title = el.querySelector(".hero-title");
    const panel = el.querySelector(".hero-panel-desk");
    const qx = gsap.quickTo(person, "x", { duration: 0.7, ease: "power3.out" });
    const tx = gsap.quickTo(title, "x", { duration: 0.7, ease: "power3.out" });
    const px = panel ? gsap.quickTo(panel, "x", { duration: 1, ease: "power3.out" }) : null;
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      qx(nx * 18);
      gsap.to(person, { y: ny * 10, rotateY: nx * 4, transformPerspective: 800, duration: 0.7, ease: "power3.out", overwrite: "auto" });
      tx(nx * -14);
      px?.(nx * 10);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <section ref={root} className="relative h-[100svh] overflow-hidden bg-[#0B0B1E]">
      {/* ============ MOBILE: coluna única ============ */}
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

        {/* painel translúcido de ondas com borda fluida — foto maior colada à esquerda */}
        <div className="fp-anim relative mt-2 min-h-0 flex-1">
          <div
            className="hero-fluid-panel absolute inset-0 overflow-hidden rounded-[26px] border border-white/15"
            style={{ boxShadow: "0 24px 70px -24px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.25)" }}
          >
            {/* fundo translúcido: mostra o site por trás, ondas com menos evidência */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(179,196,220,0.42) 0%, rgba(147,168,198,0.36) 32%, rgba(117,140,173,0.30) 62%, rgba(95,120,156,0.28) 100%)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
              }}
            />
            <div className="absolute inset-0 opacity-60">
              <PanelWaves subtle />
            </div>
            {/* véu escuro para o texto continuar legível sobre o fundo */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B1E]/55 via-[#0B0B1E]/10 to-[#0B0B1E]/15" />
            <FluidTop />
            {/* brilho superior suave */}
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-6 h-10 rounded-full bg-white/25 blur-2xl" />

            {/* Kayque maior, colado na esquerda para esconder o recorte do braço */}
            <div className="hero-person-float absolute bottom-0 left-[-14%] top-[-4%] w-[112%]">
              <Image
                src="/assets/hero/kayque.png"
                alt="Kayque Brito"
                fill
                priority
                className="fp-layer object-cover"
                style={{ objectPosition: "22% 100%" }}
                sizes="100vw"
              />
            </div>

            {/* véu inferior + placa de vidro com o tagline SOBRE a imagem (esconde o recorte de baixo) */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[#0B0B1E]/80 via-[#0B0B1E]/25 to-transparent" />
            <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/20 bg-[#0B0B1E]/45 px-4 py-3 backdrop-blur-xl" style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.35)" }}>
              <p className="text-[12.5px] font-light leading-snug text-white">
                Escalando marcas através de <em className="italic text-[#9DB8E8]">design e tecnologia</em>
              </p>
            </div>
          </div>
        </div>

        {/* ORÇAMENTO com brilho varrendo */}
        <Link
          ref={magCtaM as unknown as React.RefObject<HTMLAnchorElement>}
          href="/briefing"
          className="m-hero-in relative mt-3 flex h-[52px] w-full shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-white/90 text-[15px] uppercase text-white transition active:bg-white active:text-[#0B0B1E]"
          style={{ letterSpacing: "0.12em" }}
        >
          <span aria-hidden className="hero-cta-shine pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <span className="relative">Orçamento</span>
        </Link>
      </div>

      {/* ============ DESKTOP: composição absoluta ============ */}
      {/* auroras flutuantes atrás do painel */}
      <div aria-hidden className="hero-aurora-a absolute left-[2%] top-[22%] hidden h-[420px] w-[420px] rounded-full bg-[#9DB8E8]/15 blur-[110px] md:block" />
      <div aria-hidden className="hero-aurora-b absolute bottom-[6%] right-[2%] hidden h-[380px] w-[380px] rounded-full bg-white/[0.07] blur-[110px] md:block" />

      {/* painel de ondas — desktop também translúcido com borda fluida */}
      <div className="hero-panel-desk fp-layer absolute bottom-0 left-[8%] right-[8%] top-[36%] hidden overflow-hidden rounded-t-[36px] border border-white/15 border-b-0 md:block"
        style={{ boxShadow: "0 30px 90px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.3)" }}>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(179,196,220,0.55) 0%, rgba(147,168,198,0.45) 32%, rgba(117,140,173,0.38) 62%, rgba(95,120,156,0.34) 100%)",
            backdropFilter: "blur(4px)",
          }}
        />
        {/* corpo facetado da mesh com menos peso */}
        <svg
          className="absolute inset-0 h-full w-full opacity-60"
          viewBox="0 0 1200 620"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polygon points="0,180 140,120 260,160 0,260" fill="#8fa3c2" opacity="0.35" />
          <polygon points="140,120 320,90 420,150 260,160" fill="#a7b8d2" opacity="0.38" />
          <polygon points="320,90 520,130 420,150" fill="#c2cede" opacity="0.32" />
          <polygon points="420,150 520,130 640,170 560,220 380,210" fill="#93a7c4" opacity="0.35" />
          <polygon points="520,130 740,80 820,150 640,170" fill="#b9c7dc" opacity="0.35" />
          <polygon points="740,80 980,120 820,150" fill="#cdd7e8" opacity="0.3" />
          <polygon points="820,150 980,120 1080,170 940,210 700,200 640,170" fill="#8fa3c2" opacity="0.32" />
          <polygon points="980,120 1200,100 1200,200 1080,170" fill="#aebdd4" opacity="0.35" />
          <polygon points="0,260 260,160 380,210 200,300 0,340" fill="#7e93b5" opacity="0.3" />
          <polygon points="380,210 560,220 700,200 620,300 360,320 200,300" fill="#8699b9" opacity="0.3" />
          <polygon points="700,200 940,210 1080,170 1200,200 1200,330 900,330 620,300" fill="#7c90b3" opacity="0.3" />
        </svg>
        <FluidTop />
        <svg
          className="absolute left-0 w-full opacity-70"
          viewBox="0 0 1200 60"
          preserveAspectRatio="none"
          style={{ height: 54, top: 44 }}
          aria-hidden
        >
          <polyline
            points="0,58 60,40 140,46 230,28 320,42 420,20 520,38 640,16 760,36 880,24 980,38 1080,22 1200,36"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1.6"
          />
        </svg>
        <PanelWaves />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0B1E]/30 via-transparent to-transparent" />
      </div>

      {/* pessoa em recorte — desktop 44vw com flutuação */}
      <div className="hero-person absolute bottom-0 right-[5%] top-[12%] z-[5] hidden w-[min(44vw,640px)] md:block">
        <div className="hero-person-float absolute inset-0 h-full w-full">
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
        {/* badge orbital — só desktop com pop elástico */}
        <span className="hero-badge fp-anim absolute -left-10 top-[4%] z-20 hidden lg:block">
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

      {/* bloco tipográfico */}
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
              textShadow: "0 20px 80px rgba(0,0,0,0.45)",
            }}
          >
            <SplitChars text="Criativo" />
          </span>
        </h1>
      </div>

      {/* barra inferior — pill ORÇAMENTO magnética com shine + placa escura */}
      <div className="fp-anim absolute bottom-[5vh] left-[24%] z-10 hidden md:block">
        <Link
          ref={magCta as unknown as React.RefObject<HTMLAnchorElement>}
          href="/briefing"
          className="relative flex items-center justify-center overflow-hidden rounded-full border-[1.5px] border-white/90 text-white transition hover:bg-white hover:text-[#0B0B1E]"
          style={{
            width: "min(24vw, 470px)",
            height: 68,
            fontSize: 20,
            letterSpacing: "0.12em",
            fontWeight: 400,
          }}
        >
          <span aria-hidden className="hero-cta-shine pointer-events-none absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
          <span className="relative">ORÇAMENTO</span>
        </Link>
      </div>
      <div
        className="absolute bottom-0 right-[9%] z-10 hidden items-center rounded-tl-[24px] border border-white/10 border-b-0 bg-[#0B0B1E]/70 backdrop-blur-xl pl-14 pr-10 md:flex"
        style={{ width: "min(37vw, 700px)", height: 140 }}
      >
        <p
          className="fp-anim font-light text-[#F4F1EC]"
          style={{ fontSize: "clamp(17px, 1.25vw, 23px)", lineHeight: 1.5 }}
        >
          Escalando marcas através de <em className="italic text-[#9DB8E8]">design e tecnologia</em>
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
