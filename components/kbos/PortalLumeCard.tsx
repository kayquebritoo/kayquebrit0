"use client";
import { useEffect, useState } from "react";
import LumeMark from "@/components/kbos/lume/LumeMark";

/** Atalho do portal para o acervo do cliente no Lume (só aparece quando o admin liberou). */
export default function PortalLumeCard() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/portal/lume?check=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.available) setLabel(j.label || "sua empresa"); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!label) return null;
  return (
    <a href="/api/portal/lume" target="_blank" rel="noopener noreferrer" className="kb-glass flex min-h-16 items-center gap-4 p-4 transition-transform active:scale-[.98]">
      <LumeMark size={44} animate />
      <span className="min-w-0 flex-1">
        <b className="block text-base">Fotos e vídeos do {label}</b>
        <small className="kb-muted block text-[13px]">Busque pelo que aparece na imagem. Só visualização e download.</small>
      </span>
      <span aria-hidden className="text-xl">↗</span>
    </a>
  );
}
