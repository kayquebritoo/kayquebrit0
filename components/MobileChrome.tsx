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
      className="slide-rail pointer-events-none fixed right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 md:hidden"
    >
      {Array.from({ length: TOTAL }, (_, i) => (
        <span
          key={i}
          className={`slide-rail-dot block w-[2px] rounded-full transition-all duration-500 ease-out ${
            i === index ? "is-active h-4" : "h-1.5"
          }`}
        />
      ))}
    </div>
  );
}

/* CTA flutuante removido: a conversão agora é a página de serviços
   (/briefing) — o WhatsApp vive só como ícone no contato e no menu. */
