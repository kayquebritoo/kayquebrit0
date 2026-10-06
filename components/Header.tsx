"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LocalTime, useMagnetic } from "@/components/fx";

const MENU = [
  { label: "Sobre", index: 1 },
  { label: "Serviços", index: 2 },
  { label: "Portfólio", index: 3 },
  { label: "Depoimentos", index: 6 },
  { label: "Contato", index: 7 },
];

export function goToSlide(index: number) {
  if (window.location.pathname !== "/") {
    try {
      sessionStorage.setItem("fp-target", String(index));
    } catch {
      /* modo privado: segue sem memória */
    }
    window.dispatchEvent(new CustomEvent("fullpage:navigate-home"));
    return;
  }
  window.dispatchEvent(new CustomEvent("fullpage:go", { detail: index }));
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const magBurger = useMagnetic<HTMLButtonElement>(0.4);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const goHome = () => router.push("/");
    window.addEventListener("fullpage:navigate-home", goHome);
    return () => window.removeEventListener("fullpage:navigate-home", goHome);
  }, [router]);

  // trava o scroll da página com o menu aberto (sem GSAP: só overflow)
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* MOBILE FIRST: respiro pequeno, logo compacta */}
      <header className="fixed inset-x-0 top-0 z-[60]">
        <div className="flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7 md:px-[80px] md:pt-[42px]">
          <button
            onClick={() => {
              setOpen(false);
              goToSlide(0);
            }}
            aria-label="Kayque Brito — início"
            className="block"
          >
            <Image
              src="/logo-kayque.png"
              alt="Kayque Brito"
              width={168}
              height={64}
              priority
              className="h-9 w-auto object-contain brightness-0 invert sm:h-11 md:h-[54px]"
            />
          </button>

          <button
            ref={magBurger}
            type="button"
            onClick={toggle}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            className="group relative mt-1 flex h-10 w-11 touch-manipulation items-center justify-center md:mt-2 md:h-8 md:w-[38px]"
          >
            <span className="relative block h-[18px] w-[32px] md:w-[34px]">
              <span
                className="absolute left-0 h-[2px] w-full bg-[#F4F1EC] transition-all duration-500"
                style={
                  open
                    ? { top: "50%", transform: "translateY(-50%) rotate(45deg)" }
                    : { top: "3px", transform: "none" }
                }
              />
              <span
                className="absolute left-0 h-[2px] w-full bg-[#F4F1EC] transition-all duration-500"
                style={
                  open
                    ? { top: "50%", transform: "translateY(-50%) rotate(-45deg)" }
                    : { top: "13px", transform: "none" }
                }
              />
            </span>
          </button>
        </div>
      </header>

      {/* menu fullscreen — vidro translúcido + big titles (100% CSS, sem GSAP) */}
      <div
        aria-hidden={!open}
        className={`glass-menu fixed inset-0 z-[55] flex flex-col justify-between overflow-y-auto transition-[opacity,visibility] duration-500 ease-out ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <p
            className={`relative text-[10px] uppercase text-white/50 transition-all duration-500 sm:text-[11px] ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ letterSpacing: "0.35em", transitionDelay: open ? "60ms" : "0ms" }}
          >
            Belém — <LocalTime />
          </p>
          <nav className="relative mt-8 flex flex-col items-center gap-1 sm:mt-6 md:gap-2">
            <MenuItem
              num="01"
              label="Início"
              open={open}
              delay={100}
              onClick={() => {
                setOpen(false);
                goToSlide(0);
              }}
            />
            {MENU.map((n, i) => (
              <MenuItem
                key={n.label}
                num={String(i + 2).padStart(2, "0")}
                label={n.label}
                open={open}
                delay={140 + i * 55}
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => goToSlide(n.index), 120);
                }}
              />
            ))}
            <Link
              href="/trabalho"
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className={`menu-big group relative mt-2 px-4 py-2 text-[#9DB8E8] transition-all duration-500 hover:text-white ${
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: open ? "420ms" : "0ms" }}
            >
              <span className="menu-num">07</span>
              <span className="relative">
                Todos trabalhos
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-current transition-all duration-500 group-hover:w-full" />
              </span>
            </Link>
          </nav>
          <div
            className={`mt-10 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.25em] text-white/55 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: open ? "480ms" : "0ms" }}
          >
            <a href="https://wa.me/5591993743109" target="_blank" tabIndex={open ? 0 : -1} className="rounded-full border border-white/20 px-5 py-2.5 backdrop-blur transition hover:border-white/60 hover:text-white">
              WhatsApp
            </a>
            <a href="https://www.instagram.com/kayquebrit0/" target="_blank" rel="noopener" tabIndex={open ? 0 : -1} className="rounded-full border border-white/20 px-5 py-2.5 backdrop-blur transition hover:border-white/60 hover:text-white">
              Instagram
            </a>
          </div>
        </div>

        {/* marquee inferior do menu */}
        <div
          className={`relative overflow-hidden border-t border-white/10 py-4 transition-opacity duration-500 sm:py-5 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="animate-marquee flex w-max whitespace-nowrap text-[11px] uppercase text-white/45 sm:text-[12px]" style={{ letterSpacing: "0.3em" }}>
            {[0, 1].map((n) => (
              <span key={n} className="shrink-0 pr-8" aria-hidden={n === 1}>
                Vamos criar algo incrível juntos — Disponível para projetos — Escalando marcas através de design e tecnologia —&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function MenuItem({ label, num, open, delay, onClick }: { label: string; num: string; open: boolean; delay: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      tabIndex={open ? 0 : -1}
      className={`menu-big group relative touch-manipulation px-4 py-1.5 text-[#F4F1EC]/90 transition-all duration-500 hover:text-white sm:py-2 ${
        open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{ transitionDelay: open ? `${delay}ms` : "0ms" }}
    >
      <span className="menu-num">{num}</span>
      <span className="relative">
        {label}
        <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-white/70 transition-all duration-500 group-hover:w-full" />
      </span>
    </button>
  );
}
