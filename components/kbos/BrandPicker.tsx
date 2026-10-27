"use client";
import Image from "next/image";
import { BRAND_LOGOS, brandColor } from "@/lib/kbos/brand-colors";

/**
 * Empresas do post num toque só: marque 1 (post da empresa) ou 2-3 (colab).
 * A primeira marcada é a principal (onde o post conta no plano); as outras entram como colab.
 */
export default function BrandPicker({ brands, value, onChange, label = "Empresas" }: { brands: string[]; value: string[]; onChange: (v: string[]) => void; label?: string }) {
  const options = [...brands, ...value.filter((b) => !brands.includes(b))];
  const toggle = (b: string) => onChange(value.includes(b) ? value.filter((x) => x !== b) : [...value, b].slice(0, 3));
  const hint = value.length === 0 ? "Sem empresa identificada. Toque em uma, ou em 2–3 para colab."
    : value.length === 1 ? `Só ${value[0]}. Marque mais uma ou duas se for colab.`
    : `Colab: ${value.join(" + ")} · conta no plano de ${value[0]}`;
  return (
    <div className="kb-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((b) => {
          const i = value.indexOf(b);
          const on = i >= 0;
          const c = brandColor(b) ?? "#8a6cf0";
          return (
            <button key={b} type="button" aria-pressed={on} onClick={() => toggle(b)}
              className="kb-chip min-h-11 gap-1.5 transition-[background,border-color,transform] duration-300 active:scale-[0.96]"
              style={on ? { borderColor: c, background: `${c}26`, boxShadow: `inset 0 0 0 1px ${c}` } : { opacity: 0.72 }}>
              {BRAND_LOGOS[b] ? <Image src={BRAND_LOGOS[b]} alt="" width={20} height={20} sizes="20px" className="shrink-0 rounded-sm bg-white object-contain p-px" style={{ width: 20, height: 20 }} />
                : <i aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />}
              {b}
              {on && <span aria-hidden className="text-[12px] font-semibold" style={{ color: c }}>{value.length > 1 && i === 0 ? "★" : "✓"}</span>}
            </button>
          );
        })}
      </div>
      <span className={`text-xs ${value.length > 1 ? "kb-ink" : "kb-faint"}`}>{hint}</span>
    </div>
  );
}
