"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

const SEEN_KEY = "kbos-splash-seen";
// Tempo mínimo de marca (evita flash) + duração da saída (pede o layout).
const MIN_DISPLAY_MS = 900;
const FADE_MS = 300;

// Renderiza visível no HTML inicial (SSR) para cobrir a primeira pintura;
// no cliente, some se a sessão da aba já viu (só na abertura do app).
function initiallyVisible() {
  try {
    return typeof window === "undefined" || !window.sessionStorage.getItem(SEEN_KEY);
  } catch {
    return true;
  }
}

export default function SplashScreen() {
  const [visible, setVisible] = useState(initiallyVisible);
  const [leaving, setLeaving] = useState(false);

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
        try {
          window.sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* modo privado: exibe de novo na próxima abertura */
        }
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
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[#0B0B1E] transition-opacity duration-300 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* aurora sutil da marca */}
      <div
        aria-hidden
        className="splash-aurora pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#9DB8E8]/10 blur-[100px]"
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
