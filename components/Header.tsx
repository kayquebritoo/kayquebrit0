"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LocalTime, useMagnetic } from "@/components/fx";
import { SocialIcon } from "@/components/SocialIcons";
import { SOCIALS } from "@/lib/data";
import { LANGS } from "@/lib/i18n";
import { useLang, useTheme } from "@/components/Providers";

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
  const { lang, setLang, t } = useLang();
  const { theme, toggle } = useTheme();

  const toggleMenu = useCallback(() => setOpen((v) => !v), []);

  const MENU = [
    { label: t("menu.about"), index: 1 },
    { label: t("menu.services"), index: 2 },
    { label: t("menu.portfolio"), index: 3 },
    { label: t("menu.testimonials"), index: 6 },
    { label: t("menu.contact"), index: 7 },
  ];

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
            onClick={toggleMenu}
            aria-label={open ? t("menu.close") : t("menu.open")}
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
          <nav className="relative mt-6 flex flex-col items-center gap-0.5 sm:mt-5 md:gap-1">
            <MenuItem
              num="01"
              label={t("menu.home")}
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
              className={`menu-big group relative mt-1 px-4 py-1.5 text-[#9DB8E8] transition-all duration-500 hover:text-white ${
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: open ? "420ms" : "0ms" }}
            >
              <span className="menu-num">07</span>
              <span className="relative">
                {t("menu.allWorks")}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-current transition-all duration-500 group-hover:w-full" />
              </span>
            </Link>
          </nav>

          {/* sociais como ícones (inclui WhatsApp) */}
          <div
            className={`mt-8 flex flex-wrap items-center justify-center gap-2.5 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: open ? "470ms" : "0ms" }}
          >
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener"
                tabIndex={open ? 0 : -1}
                aria-label={s.name}
                title={s.name}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-white/70 backdrop-blur transition hover:border-white/60 hover:text-white"
              >
                <SocialIcon icon={s.icon} size={18} />
              </a>
            ))}
          </div>

          {/* tema + idioma */}
          <div
            className={`mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: open ? "520ms" : "0ms" }}
          >
            <button
              type="button"
              onClick={toggle}
              tabIndex={open ? 0 : -1}
              aria-label={theme === "dark" ? t("menu.themeLight") : t("menu.themeDark")}
              title={theme === "dark" ? t("menu.themeLight") : t("menu.themeDark")}
              className="flex h-11 items-center gap-2.5 rounded-full border border-white/20 px-5 text-[11px] uppercase tracking-[0.22em] text-white/70 backdrop-blur transition hover:border-white/60 hover:text-white"
            >
              <span aria-hidden className="inline-flex">
                {theme === "dark" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                  </svg>
                )}
              </span>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <div
              role="group"
              aria-label={t("menu.language")}
              className="flex items-center gap-1 rounded-full border border-white/20 p-1 backdrop-blur"
            >
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  tabIndex={open ? 0 : -1}
                  aria-label={l.name}
                  aria-pressed={lang === l.id}
                  title={l.name}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-semibold tracking-[0.14em] transition ${
                    lang === l.id
                      ? "bg-white text-black"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  <span aria-hidden>{l.flag}</span>
                  {l.label}
                </button>
              ))}
            </div>
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
                {t("menu.marquee")}&nbsp;
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
      className={`menu-big group relative touch-manipulation px-4 py-1 text-[#F4F1EC]/90 transition-all duration-500 hover:text-white sm:py-1.5 ${
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
