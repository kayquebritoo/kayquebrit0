import { useId } from "react";

/**
 * Símbolo do Lume: uma lente de luz revelando um momento, com a onda de som como assinatura.
 * 100% código (SVG). As cores vêm de variáveis CSS (.lume-mark em globals.css), então acompanha
 * o tema claro/escuro; `variant` força um dos dois (ex.: sobre fundo fixo).
 */
const BARS: [number, number][] = [[19.8, 10], [26, 20], [32, 28], [38, 18], [44.2, 8]];

export default function LumeMark({ size = 40, variant = "auto", animate = false, title }: {
  size?: number; variant?: "auto" | "dark" | "light"; animate?: boolean; title?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`lume-mark${animate ? " lume-animate" : ""}`} data-variant={variant} viewBox="0 0 64 64" width={size} height={size}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: "var(--lm-frame-a)" }} /><stop offset="1" style={{ stopColor: "var(--lm-frame-b)" }} /></linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="1" x2="1" y2="0"><stop offset="0" style={{ stopColor: "var(--lm-ring-a)" }} /><stop offset=".6" style={{ stopColor: "var(--lm-ring-b)" }} /><stop offset="1" style={{ stopColor: "var(--lm-ring-c)" }} /></linearGradient>
        <radialGradient id={`${id}h`} cx=".5" cy=".5" r=".5"><stop offset="0" style={{ stopColor: "var(--lm-halo)", stopOpacity: "var(--lm-halo-o)" }} /><stop offset="1" style={{ stopColor: "var(--lm-halo)", stopOpacity: 0 }} /></radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${id}f)`} style={{ stroke: "var(--lm-stroke)", strokeOpacity: "var(--lm-stroke-o)" }} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="25" fill={`url(#${id}h)`} />
      <circle cx="32" cy="32" r="15" fill="none" stroke={`url(#${id}r)`} strokeWidth="3" />
      {BARS.map(([x, h], i) => (
        <rect key={x} className="lume-bar" style={{ ["--i" as string]: i, fill: "var(--lm-bar)" }} x={x - 1.7} y={32 - h / 2} width="3.4" height={h} rx="1.7" />
      ))}
    </svg>
  );
}
