"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

export type Slide = { id: string; label: string };

// Motor v5 — UNIVERSAL (mobile + desktop com a mesma experiência):
// - cada slide tem exatamente 100svh; o track anda em px medidos (sem deriva vh/svh)
// - mesma timeline GSAP de entrada/saída (.fp-anim + .fp-layer) nas duas vistas
// - desktop: wheel + teclado + dots · mobile: swipe vertical (touch-action pan-x)

export default function Fullpage({
  slides,
  children,
}: {
  slides: Slide[];
  children: React.ReactNode[];
}) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const animating = useRef(false);
  const touchY = useRef(0);
  const indexRef = useRef(0);
  const dotWrap = useRef<HTMLElement>(null);

  const slideH = useCallback(() => {
    const first = track.current?.children[0] as HTMLElement | undefined;
    return first?.clientHeight || window.innerHeight;
  }, []);

  useEffect(() => {
    indexRef.current = index;
    // avisa o chrome mobile (indicador 01/08, CTA flutuante)
    window.dispatchEvent(new CustomEvent("fullpage:change", { detail: index }));
    if (dotWrap.current) {
      const dots = dotWrap.current.querySelectorAll(".fp-dot");
      const active = dots[index];
      if (active) {
        gsap.fromTo(
          active,
          { scale: 0.3 },
          { scale: 1, duration: 0.45, ease: "back.out(2.2)", overwrite: "auto" }
        );
      }
    }
  }, [index]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next));
      if (animating.current || clamped === indexRef.current || !track.current) return;
      animating.current = true;

      const prev = indexRef.current;
      const dir = clamped > prev ? 1 : -1;
      const slideEls = track.current.children;
      const outAnims = slideEls[prev]?.querySelectorAll(".fp-anim");
      const outLayers = slideEls[prev]?.querySelectorAll(".fp-layer");
      const inAnims = slideEls[clamped]?.querySelectorAll(".fp-anim");
      const inLayers = slideEls[clamped]?.querySelectorAll(".fp-layer");
      const y = -clamped * slideH();

      const tl = gsap.timeline({
        defaults: { overwrite: "auto" },
        onComplete: () => {
          setIndex(clamped);
          animating.current = false;
        },
      });

      // 1 — saída do texto: deriva curta na direção do gesto + blur
      if (outAnims?.length) {
        tl.to(
          outAnims,
          {
            y: -44 * dir,
            opacity: 0,
            filter: "blur(6px)",
            stagger: 0.025,
            duration: 0.28,
            ease: "power3.in",
          },
          0
        );
      }
      // 2 — saída das mídias: parallax curto
      if (outLayers?.length) {
        tl.to(
          outLayers,
          {
            y: -32 * dir,
            scale: 1.04,
            opacity: 0.4,
            duration: 0.55,
            ease: "expo.in",
          },
          0
        );
      }

      // 3 — track: tira contínua 0.72s expo.inOut + skew sutil de velocidade
      const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      tl.to(track.current, { y, duration: 0.72, ease: "expo.inOut" }, 0);
      if (!RM) {
        tl.fromTo(
          track.current,
          { skewY: 0 },
          { skewY: -0.9 * dir, duration: 0.3, ease: "power2.in" },
          0
        );
        tl.to(track.current, { skewY: 0, duration: 0.42, ease: "expo.out" }, 0.3);
      } else {
        tl.timeScale(3);
      }

      // 4 — entrada das mídias
      if (inLayers?.length) {
        tl.fromTo(
          inLayers,
          { y: 80 * dir, scale: 1.06, opacity: 0.4 },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.75,
            ease: "expo.out",
          },
          0.3
        );
      }
      // 5 — entrada do texto: blur 8→0, stagger curto, a ~45% da track
      if (inAnims?.length) {
        tl.fromTo(
          inAnims,
          { y: 44 * dir, opacity: 0, filter: "blur(8px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            stagger: 0.04,
            duration: 0.6,
            ease: "power4.out",
            clearProps: "filter",
          },
          0.34
        );
      }
    },
    [slides.length, slideH]
  );

  // intro cinematográfica (dispara direto, sem preloader)
  useEffect(() => {
    document.documentElement.classList.add("fullpage-locked");
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.fromTo(
        ".fp-slide-0 .fp-layer",
        { y: 70, scale: 1.06, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.9, ease: "expo.out" },
        0.1
      );
      tl.fromTo(
        ".fp-slide-0 .fp-anim",
        { y: 44, opacity: 0, filter: "blur(8px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.05,
          duration: 0.7,
          ease: "power4.out",
          clearProps: "filter",
        },
        0.35
      );
      const kick = window.setTimeout(() => tl.play(), 120);
      return () => clearTimeout(kick);
    });
    // navegação vinda de /trabalho (menu → seção da home)
    try {
      const target = sessionStorage.getItem("fp-target");
      if (target) {
        sessionStorage.removeItem("fp-target");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("fullpage:go", { detail: Number(target) }));
        }, 300);
      }
    } catch {
      /* modo privado: segue sem memória */
    }
    // recalibra o track em resize/rotação (svh muda no mobile)
    const onResize = () => {
      if (track.current && !animating.current) {
        gsap.set(track.current, { y: -indexRef.current * slideH() });
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.documentElement.classList.remove("fullpage-locked");
      ctx.revert();
    };
  }, [slideH]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (animating.current) return;
      goTo(indexRef.current + (e.deltaY > 0 ? 1 : -1));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") goTo(indexRef.current + 1);
      if (e.key === "ArrowUp" || e.key === "PageUp") goTo(indexRef.current - 1);
    };
    const onTouchStart = (e: TouchEvent) => (touchY.current = e.touches[0].clientY);
    const onTouchEnd = (e: TouchEvent) => {
      const d = touchY.current - e.changedTouches[0].clientY;
      if (Math.abs(d) > 50) goTo(indexRef.current + (d > 0 ? 1 : -1));
    };
    const onGo = (e: Event) => goTo((e as CustomEvent<number>).detail);

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("fullpage:go", onGo);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("fullpage:go", onGo);
    };
  }, [goTo]);

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-[#0B0B1E] [touch-action:pan-x]">
      <div ref={track} className="will-change-transform">
        {children.map((c, i) => (
          <div
            key={slides[i].id}
            id={slides[i].id}
            className={`fp-slide-${i} h-[100svh] w-full shrink-0 overflow-hidden`}
          >
            {c}
          </div>
        ))}
      </div>

      {/* dots hollow — só desktop largo */}
      <nav
        ref={dotWrap}
        aria-label="Navegação de seções"
        className="absolute left-[80px] top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-4 lg:flex"
      >
        {slides.map((s, i) => (
          <button
            key={s.id}
            onClick={() => goTo(i)}
            aria-label={s.label}
            title={s.label}
            className="flex h-5 w-5 items-center justify-center"
          >
            <span className={`fp-dot ${i === index ? "active" : ""}`} />
          </button>
        ))}
      </nav>

      {/* ROLAR — inferior esquerdo, vertical (desktop) */}
      <div className="pointer-events-none absolute bottom-[110px] left-[74px] z-40 hidden lg:block">
        <span
          className="v-text block text-[13px] font-light uppercase text-white/35"
          style={{ letterSpacing: "0.35em", transform: "rotate(180deg)" }}
        >
          Rolar
        </span>
      </div>

      {/* Portfólio Kayque Brito + filete — direita (desktop) */}
      <div className="pointer-events-none absolute right-[68px] top-[30%] z-40 hidden flex-col items-center gap-6 lg:flex">
        <span
          className="v-text block text-[13px] font-light uppercase text-white/40"
          style={{ letterSpacing: "0.35em" }}
        >
          Portfólio Kayque Brito
        </span>
        <span
          className="relative block h-[180px] w-px overflow-hidden bg-white/15"
          aria-hidden
        >
          <span
            className="absolute inset-0 origin-top bg-white/70 transition-transform duration-500 ease-out"
            style={{ transform: `scaleY(${(index + 1) / slides.length})` }}
          />
        </span>
      </div>
    </div>
  );
}
