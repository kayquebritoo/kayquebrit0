"use client";
import { useEffect, useRef, useState } from "react";

/* Gráficos leves (SVG puro) com animação de entrada — dashboard vivo do KBOS. */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Número que sobe até o valor (easeOutExpo). */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      from.current = value;
      const t = setTimeout(() => setN(value), 0);
      return () => clearTimeout(t);
    }
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format ? format(n) : Math.round(n)}</>;
}

/** Anel de proporção (ex.: entrou × saiu). */
export function Ring({ a, b, size = 132, labelA, labelB }: { a: number; b: number; size?: number; labelA: string; labelB: string }) {
  const total = a + b;
  const r = size / 2 - 11;
  const circ = 2 * Math.PI * r;
  const pa = total ? a / total : 0;
  const pb = total ? b / total : 0;
  const gap = total && pa > 0 && pb > 0 ? 6 : 0;
  const la = Math.max(0, circ * pa - gap);
  const lb = Math.max(0, circ * pb - gap);
  return (
    <svg role="img" aria-label={`${labelA} ${Math.round(pa * 100)}% · ${labelB} ${Math.round(pb * 100)}%`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <linearGradient id="kbRingA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F12C7" />
          <stop offset="100%" stopColor="#9A6BFF" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--kb-line)" strokeWidth="10" />
      {total > 0 && (
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth="10" strokeLinecap="round">
          <circle className="kb-ringfill" cx={size / 2} cy={size / 2} r={r} stroke="url(#kbRingA)" strokeDasharray={`${la} ${circ}`} style={{ "--circ": circ } as React.CSSProperties} />
          <circle className="kb-ringfill" cx={size / 2} cy={size / 2} r={r} stroke="var(--kb-late-dot)" strokeOpacity=".85" strokeDasharray={`${lb} ${circ}`} strokeDashoffset={-(la + gap)} style={{ "--circ": circ } as React.CSSProperties} />
        </g>
      )}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--kb-ink)" fontSize="22" fontWeight="300" style={{ fontFamily: "var(--font-display)" }}>
        {total ? `${Math.round(pa * 100)}%` : "—"}
      </text>
    </svg>
  );
}

/** Barras (carga dos próximos dias). */
export function Bars({ items, height = 96 }: { items: { label: string; value: number; hot?: boolean }[]; height?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-2" style={{ height: height + 22 }} role="img" aria-label="Demandas por dia">
      {items.map((it, i) => (
        <div key={it.label + i} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
          <span className="kb-faint text-[11px] tabular-nums">{it.value || ""}</span>
          <div
            className="kb-bar w-full rounded-[8px]"
            style={{
              height: Math.max(4, (it.value / max) * height),
              animationDelay: `${i * 60}ms`,
              background: it.hot
                ? "linear-gradient(180deg, var(--kb-late-dot), rgba(255,92,92,.25))"
                : it.value
                  ? "linear-gradient(180deg, #8A5CF0, #4F12C7)"
                  : "var(--kb-chip)",
            }}
          />
          <span className="kb-faint text-[11px]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Traço que se desenha sozinho (curva suave) com ponto pulsante no fim. */
export function AnimatedLine({ series }: { series: number[] }) {
  const pts = series.length > 1 ? series : [0, ...series, ...(series.length ? [] : [0])];
  const min = Math.min(0, ...pts);
  const max = Math.max(0, ...pts);
  const span = max - min || 1;
  const W = 640;
  const H = 130;
  const xy = pts.map((v, i) => [(i / Math.max(1, pts.length - 1)) * W, H - 10 - ((v - min) / span) * (H - 28)] as const);
  // curva suave (Catmull-Rom → Bézier)
  let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const end = xy[xy.length - 1];
  return (
    <div className="relative">
      <svg role="img" aria-label="Saldo acumulado ao longo do mês" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[130px] w-full">
        <defs>
          <linearGradient id="kbArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(79,18,199,0.45)" />
            <stop offset="100%" stopColor="rgba(79,18,199,0)" />
          </linearGradient>
          <linearGradient id="kbStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4F12C7" />
            <stop offset="75%" stopColor="#8A5CF0" />
            <stop offset="100%" stopColor="#D98BFF" />
          </linearGradient>
        </defs>
        <path className="kb-area" d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#kbArea)" />
        <path className="kb-draw" pathLength={3000} style={{ "--len": 3000 } as React.CSSProperties} d={d} fill="none" stroke="url(#kbStroke)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        aria-hidden
        className="kb-pulse-dot absolute h-2.5 w-2.5 rounded-full bg-[#D98BFF]"
        style={{ left: `calc(${(end[0] / W) * 100}% - 5px)`, top: `calc(${(end[1] / H) * 100}% - 5px)` }}
      />
    </div>
  );
}
