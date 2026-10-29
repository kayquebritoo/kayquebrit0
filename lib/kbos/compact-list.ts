/**
 * Listas compactas (issue #1 do kbos-cerebro): resumos mostram 5 itens,
 * "Ver mais" soma +5, "Recolher" volta aos 5 e "Ver todos" leva à lista
 * completa do módulo. Regra pura, sem React, para testar sem navegador.
 */
export const COMPACT_STEP = 5;

export type CompactState = {
  /** Quantos itens mostrar agora. */
  visible: number;
  /** Itens ainda escondidos. */
  remaining: number;
  /** Quanto o próximo "Ver mais" acrescenta (nunca passa do total). */
  nextStep: number;
  canMore: boolean;
  canCollapse: boolean;
};

export function compactState(total: number, shown: number, step = COMPACT_STEP): CompactState {
  const t = Math.max(0, Math.floor(total) || 0);
  const s = Math.max(1, Math.floor(step) || COMPACT_STEP);
  const visible = Math.min(t, Math.max(s, Math.floor(shown) || s));
  const remaining = t - visible;
  return {
    visible,
    remaining,
    nextStep: Math.min(s, remaining),
    canMore: remaining > 0,
    canCollapse: visible > s,
  };
}

/** Próximo valor de `shown` ao tocar em "Ver mais". */
export const showMore = (total: number, shown: number, step = COMPACT_STEP) =>
  Math.min(Math.max(0, total), compactState(total, shown, step).visible + step);
