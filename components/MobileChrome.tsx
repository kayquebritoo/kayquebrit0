"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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

/* CTA flutuante removido: a conversão agora é a página de serviços
   (/briefing) — o WhatsApp vive só como ícone no contato e no menu. */
