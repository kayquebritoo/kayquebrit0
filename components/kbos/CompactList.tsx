"use client";
import Link from "next/link";
import { useState } from "react";
import { COMPACT_STEP, compactState, showMore } from "@/lib/kbos/compact-list";

/**
 * Lista compacta reutilizável: guarda quantos itens aparecem e devolve a
 * fatia visível. O estado fica no componente (trocar filtro não reseta a
 * expansão; o número só é limitado ao total).
 */
export function useCompactList<T>(items: readonly T[], step = COMPACT_STEP) {
  const [shown, setShown] = useState(step);
  const state = compactState(items.length, shown, step);
  return {
    items: items.slice(0, state.visible),
    state,
    total: items.length,
    more: () => setShown((s) => showMore(items.length, s, step)),
    collapse: () => setShown(step),
  };
}

type Props = {
  total: number;
  state: ReturnType<typeof compactState>;
  more: () => void;
  collapse: () => void;
  /** Leva à lista completa do módulo (com busca/filtros). */
  allHref?: string;
  allLabel?: string;
  /** Nome dos itens para leitores de tela, ex.: "tarefas". */
  noun?: string;
  className?: string;
};

export function CompactListControls({ total, state, more, collapse, allHref, allLabel = "Ver todos", noun = "itens", className = "" }: Props) {
  if (!state.canMore && !state.canCollapse && !(allHref && total > state.visible)) return null;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 ${className}`}>
      {state.canMore && (
        <button type="button" className="kb-btn-ghost min-h-11 flex-1" onClick={more} aria-label={`Ver mais ${state.nextStep} ${noun}; faltam ${state.remaining}`}>
          Ver mais {state.nextStep}
          <span className="kb-faint ml-1 text-xs tabular-nums">({state.remaining} restantes)</span>
        </button>
      )}
      {state.canCollapse && (
        <button type="button" className="kb-btn-ghost min-h-11" onClick={collapse} aria-label={`Recolher ${noun}`}>
          Recolher
        </button>
      )}
      {allHref && total > 0 && (
        <Link href={allHref} className="kb-chip min-h-11 inline-flex items-center">
          {allLabel} ({total})
        </Link>
      )}
    </div>
  );
}
