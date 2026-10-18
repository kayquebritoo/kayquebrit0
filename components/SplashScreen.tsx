"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

const SEEN_KEY = "kbos-splash-seen";
// Tempo mínimo de marca (evita flash) + duração da saída (pede o layout).
const MIN_DISPLAY_MS = 900;
const FADE_MS = 300;

/** Detecta o app instalado (PWA standalone). Cobre Android/Chrome
 *  (display-mode), iOS Safari antigo (navigator.standalone) e TWA. */
export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    // iOS < 16 / "Adicionar à Tela de Início"
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (typeof nav.standalone === "boolean" && nav.standalone) return true;
    // Android TWA / Custom Tab aberta pelo app
    if (document.referrer.startsWith("android-app://")) return true;
  } catch {
    /* matchMedia indisponível: assume navegador comum */
  }
  return false;
}

function wasSeenThisSession(): boolean {
  try {
    return !!window.sessionStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* modo privado: exibe de novo na próxima abertura */
  }
}

// Splash EXCLUSIVA do PWA instalado: no navegador comum o componente
// nunca renderiza (carregamento direto). No standalone, cobre os
// primeiros instantes e sai em fade — e só uma vez por aba/sessão.
export default function SplashScreen() {
  // Começa invisível (inclusive no SSR) para o browser nunca nem
  // piscar a splash; o standalone liga no efeito abaixo.
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Adiado p/ o próximo frame: evita setState síncrono no efeito e
    // deixa a primeira pintura (direta no browser) intacta.
    const id = requestAnimationFrame(() => {
      if (!isStandaloneMode()) return;
      // Classe de apoio p/ o CSS de safe-area cobrir iOS sem media query.
      document.documentElement.classList.add("is-standalone");
      if (wasSeenThisSession()) return;
      setVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    // Pronto = página carregada + marca mínima exibida.
    const loaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const onLoad = () => resolve();
            window.addEventListener("load", onLoad, { once: true });
            // Rede de segurança: nunca prende a splash.
            setTimeout(resolve, 4000);
          });
    const shown = new Promise<void>((resolve) => setTimeout(resolve, MIN_DISPLAY_MS));
    void Promise.all([loaded, shown]).then(() => {
      if (!alive) return;
      setLeaving(true);
      fadeTimer = setTimeout(() => {
        if (!alive) return;
        markSeen();
        setVisible(false);
      }, FADE_MS);
    });
    return () => {
      alive = false;
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[#11101E] transition-opacity duration-300 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* aurora sutil da marca */}
      <div
        aria-hidden
        className="splash-aurora pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4F12C7]/30 blur-[100px]"
      />
      <div className="splash-logo relative">
        <Image
          src="/logo-kayque.png"
          alt=""
          width={168}
          height={64}
          priority
          className="h-12 w-auto object-contain brightness-0 invert"
        />
      </div>
      <p className="splash-tag text-[10px] font-light uppercase text-white/40" style={{ letterSpacing: "0.4em" }}>
        KBOS
      </p>
    </div>
  );
}
