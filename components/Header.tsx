"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const magBurger = useMagnetic<HTMLButtonElement>(0.4);
  const { lang, setLang, t } = useLang();
  const { theme, toggle } = useTheme();

  const toggleMenu = useCallback(() => setOpen((v) => !v), []);

  // Telas de app (admin/portal/entrar) têm chrome próprio (KbosShell) —
  // o header do site sumiria por cima do topbar delas, então nem renderiza.
  // Mesmo padrão do SlideProgress (só home).
  const isApp =
    pathname.startsWith("/admin") || pathname.startsWith("/portal") || pathname.startsWith("/entrar") || pathname.startsWith("/proposta") || pathname.startsWith("/planejamento");
  const isHome = pathname === "/";

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

  const closeAndHome = () => {
    setOpen(false);
    goToSlide(0);
  };

  const logoBtn = (compact?: boolean) => (
    <button
      onClick={closeAndHome}
      aria-label="Kayque Brito — início"
      className="block"
    >
      <Image
        src="/logo-kayque.png"
        alt="Kayque Brito"
        width={168}
        height={64}
        priority
        className={`w-auto object-contain brightness-0 invert ${
          compact ? "h-8 md:h-9" : "h-9 sm:h-11 md:h-[54px]"
        }`}
      />
    </button>
  );

  const burgerBtn = (compact?: boolean) => (
    <button
      ref={magBurger}
      type="button"
      onClick={toggleMenu}
      aria-label={open ? t("menu.close") : t("menu.open")}
      aria-expanded={open}
      className={`group relative flex touch-manipulation items-center justify-center ${
        compact ? "h-9 w-10" : "mt-1 h-10 w-11 md:mt-2 md:h-8 md:w-[38px]"
      }`}
    >
      <span className="relative block h-[18px] w-[32px] md:w-[34px]">
        <span
          className="absolute left-0 h-[2px] w-full bg-[#EDE6EC] transition-all duration-500"
          style={
            open
              ? { top: "50%", transform: "translateY(-50%) rotate(45deg)" }
              : { top: "3px", transform: "none" }
          }
        />
        <span
          className="absolute left-0 h-[2px] w-full bg-[#EDE6EC] transition-all duration-500"
          style={
            open
              ? { top: "50%", transform: "translateY(-50%) rotate(-45deg)" }
              : { top: "13px", transform: "none" }
          }
        />
      </span>
    </button>
  );

  if (isApp) return null;

  return (
    <>
      {isHome ? (
        /* HOME: flutuante sobre o hero fullscreen (composição original) */
        <header className="fixed inset-x-0 top-0 z-[60]">
          <div className="flex items-start justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-[max(1.75rem,env(safe-area-inset-top))] md:px-[80px] md:pt-[42px]">
            {logoBtn()}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {burgerBtn()}
            </div>
          </div>
        </header>
      ) : (
        /* DEMAIS PÁGINAS: pill compacta em vidro — nunca colide com o conteúdo */
        <header className="fixed inset-x-0 top-0 z-[60] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="header-glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-[#11101E]/70 py-2 pl-4 pr-2.5 shadow-2xl shadow-black/30 backdrop-blur-xl">
            {logoBtn(true)}
            <div className="flex items-center gap-2">
              {burgerBtn(true)}
            </div>
          </div>
        </header>
      )}

      {/* menu fullscreen — vidro translúcido + big titles (100% CSS, sem GSAP) */}
      <div
        aria-hidden={!open}
        className={`glass-menu fixed inset-0 z-[58] flex flex-col justify-between overflow-y-auto transition-[opacity,visibility] duration-500 ease-out ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-between gap-10 px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[calc(7rem+env(safe-area-inset-top))] sm:px-10 md:flex-row md:items-end md:gap-16 md:px-[80px] md:pb-14 md:pt-36">
          {/* navegação: alinhada à esquerda, com respiro */}
          <nav aria-label={t("menu.open")} className="flex flex-col items-start gap-1.5 md:gap-2">
            <MenuItem
              num="01"
              label={t("menu.home")}
              open={open}
              delay={80}
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
                delay={120 + i * 50}
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
              className={`menu-big group relative py-1 text-left text-[#EDE6EC]/90 transition-[opacity,transform,color] duration-500 hover:text-white sm:py-1.5 ${
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: open ? "420ms" : "0ms" }}
            >
              <span className="menu-num">07</span>
              <span className="relative">
                {t("menu.allWorks")}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-current transition-[width] duration-500 group-hover:w-full" />
              </span>
            </Link>
          </nav>

          {/* utilidades ancoradas embaixo (no desktop, à direita) */}
          <div
            className={`flex w-full flex-col gap-5 border-t border-white/10 pt-6 transition-[opacity,transform] duration-500 md:w-auto md:max-w-[360px] md:items-end md:border-t-0 md:pt-0 ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
            style={{ transitionDelay: open ? "460ms" : "0ms" }}
          >
            <p className="text-[13px] font-light text-white/50">
              Belém — <LocalTime />
            </p>
            <Link
              href="/entrar"
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className="flex h-14 w-full items-center justify-center rounded-full border border-white/25 px-7 text-[15px] text-white/90 transition-[background-color,color,border-color] hover:border-white hover:bg-white hover:text-black md:w-[320px]"
            >
              Área do cliente
            </Link>
            <div className="soc-row">
              {SOCIALS.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener"
                  tabIndex={open ? 0 : -1}
                  aria-label={s.name}
                  title={s.name}
                  className="soc-btn"
                >
                  <SocialIcon icon={s.icon} size={16} />
                </a>
              ))}
            </div>
            <div className="flex w-full items-center justify-between gap-3 md:justify-end">
              <button
                type="button"
                onClick={toggle}
                tabIndex={open ? 0 : -1}
                aria-label={theme === "dark" ? t("menu.themeLight") : t("menu.themeDark")}
                title={theme === "dark" ? t("menu.themeLight") : t("menu.themeDark")}
                className="flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px] text-white/70 transition-[color,border-color] hover:border-white/60 hover:text-white"
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
                {theme === "dark" ? "Claro" : "Escuro"}
              </button>
              <div
                role="group"
                aria-label={t("menu.language")}
                className="flex items-center gap-1 rounded-full border border-white/15 p-1"
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
                    className={`flex h-9 items-center rounded-full px-3.5 text-[12px] font-semibold tracking-[0.08em] transition-[background-color,color] ${
                      lang === l.id ? "bg-white text-black" : "text-white/60 hover:text-white"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
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
      className={`menu-big group relative touch-manipulation py-1 text-left text-[#EDE6EC]/90 transition-[opacity,transform,color] duration-500 hover:text-white sm:py-1.5 ${
        open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      style={{ transitionDelay: open ? `${delay}ms` : "0ms" }}
    >
      <span className="menu-num">{num}</span>
      <span className="relative">
        {label}
        <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-white/70 transition-[width] duration-500 group-hover:w-full" />
      </span>
    </button>
  );
}
