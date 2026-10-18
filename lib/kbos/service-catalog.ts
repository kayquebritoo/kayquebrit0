// Catálogo de serviços — parte pura (sem banco), usada no site e no painel.
// Os padrões vêm de `briefing-forms.ts`; o que o Kayque edita no admin
// (`kbos_services`) sobrescreve campo a campo. Fonte única de valor, prazo e
// "o que está incluso" no site público e nos orçamentos do KBOS.
import { BRIEFING_CATEGORIES, type BriefingCategory } from "./briefing-forms";

export const FRONTS = [
  { id: "imagem", label: "Imagem" },
  { id: "marca", label: "Marca" },
  { id: "codigo", label: "Código" },
] as const;

export type Override = {
  slug: string;
  label: string | null;
  tagline: string | null;
  description: string | null;
  priceFrom: string | number | null;
  term: string | null;
  includes: string[] | null;
  pitch: string[] | null;
  process: { title: string; desc: string }[] | null;
  active: boolean;
};

export type Service = BriefingCategory & { active: boolean; custom: boolean };

/** 1500 → "1.500" (sem depender de ICU do runtime). */
export function brlInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export const priceLabel = (n: number) => `a partir de R$ ${brlInt(n)}`;

const text = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = <T,>(v: T[] | null | undefined) => (Array.isArray(v) && v.length ? v : null);

export function mergeService(base: BriefingCategory, o?: Override | null): Service {
  if (!o) return { ...base, active: true, custom: false };
  const price = o.priceFrom === null || o.priceFrom === undefined || o.priceFrom === "" ? null : Number(o.priceFrom);
  const priceFrom = price !== null && Number.isFinite(price) && price >= 0 ? price : base.priceFrom;
  return {
    ...base,
    label: text(o.label) ?? base.label,
    tagline: text(o.tagline) ?? base.tagline,
    desc: text(o.description) ?? base.desc,
    priceFrom,
    baseValue: priceLabel(priceFrom),
    term: o.term === null ? base.term : o.term.trim(),
    bullets: list(o.includes) ?? base.bullets,
    pitch: list(o.pitch) ?? base.pitch,
    process: list(o.process) ?? base.process,
    active: o.active,
    custom: true,
  };
}

export function mergeCatalog(rows: Override[]): Service[] {
  const by = new Map(rows.map((r) => [r.slug, r]));
  return BRIEFING_CATEGORIES.map((c) => mergeService(c, by.get(c.id)));
}

/** Versão enxuta para telas do painel (picker de orçamento). */
export type ServiceLite = {
  slug: string;
  label: string;
  front: Service["front"];
  priceFrom: number;
  term: string;
  includes: string[];
  description: string;
};
export const toLite = (s: Service): ServiceLite => ({
  slug: s.id,
  label: s.label,
  front: s.front,
  priceFrom: s.priceFrom,
  term: s.term,
  includes: s.bullets,
  description: s.desc,
});
