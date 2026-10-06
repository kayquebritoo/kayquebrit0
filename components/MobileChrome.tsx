"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WHATSAPP } from "@/lib/data";

const TOTAL = 8;

/* Indicador de progresso dos slides — só home, só mobile */
export function SlideProgress() {
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => setIndex((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("fullpage:change", onChange);
    return () => window.removeEventListener("fullpage:change", onChange);
  }, []);
  if (pathname !== "/") return null;
  return (
    <div
      aria-hidden
      className="fixed right-5 top-[72px] z-40 flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-md md:hidden"
    >
      <span className="text-[11px] font-medium tabular-nums tracking-[0.2em] text-white/80">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="relative block h-px w-8 overflow-hidden bg-white/25">
        <span
          className="absolute inset-0 origin-left bg-white/85 transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${(index + 1) / TOTAL})` }}
        />
      </span>
      <span className="text-[11px] tabular-nums tracking-[0.2em] text-white/40">
        {String(TOTAL).padStart(2, "0")}
      </span>
    </div>
  );
}

/* CTA flutuante de WhatsApp — só mobile; some no slide Contato (já tem CTA) */
export function MobileCta() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onChange = (e: Event) =>
      setHidden(pathname === "/" && (e as CustomEvent<number>).detail === 7);
    window.addEventListener("fullpage:change", onChange);
    return () => window.removeEventListener("fullpage:change", onChange);
  }, [pathname]);
  return (
    <a
      href={WHATSAPP}
      target="_blank"
      rel="noopener"
      aria-label="Conversar no WhatsApp"
      tabIndex={hidden ? -1 : 0}
      className={`fixed bottom-5 right-5 z-[52] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_36px_rgba(37,211,102,0.45)] transition-all duration-400 active:scale-95 md:hidden ${
        hidden ? "pointer-events-none scale-50 opacity-0" : "scale-100 opacity-100"
      }`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.4A8.5 8.5 0 1 1 21 11.5Z" />
        <path d="M9 10.5c.5 2.5 2.5 4.5 5 5l1.5-1.5 2 1c-.5 1.5-1.5 2-3 1.5-3-1-5.5-3.5-6.5-6.5-.5-1.5 0-2.5 1.5-3l1 2L9 10.5Z" fill="currentColor" stroke="none" />
      </svg>
    </a>
  );
}
