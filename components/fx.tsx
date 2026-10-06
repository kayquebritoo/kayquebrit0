"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/* ---------- botão magnético (só desktop com mouse: no touch o botão
   ficaria se mexendo sob o dedo e o navegador pode engolir o clique) ---------- */
export function useMagnetic<T extends HTMLElement>(strength = 0.35) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(hover: none)").matches
    )
      return;
    const qx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const qy = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      qx((e.clientX - (r.left + r.width / 2)) * strength);
      qy((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () =>
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1, 0.35)", overwrite: "auto" });
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [strength]);
  return ref;
}

/* ---------- split por caractere (reveal tipográfico) ---------- */
export function SplitChars({ text }: { text: string }) {
  return (
    <span aria-label={text}>
      {text.split("").map((c, i) => (
        <span key={i} aria-hidden className="hero-char inline-block will-change-transform">
          {c === " " ? " " : c}
        </span>
      ))}
    </span>
  );
}

/* ---------- relógio ao vivo (Belém) ---------- */
export function LocalTime() {
  const [t, setT] = useState("--:--");
  useEffect(() => {
    const f = () =>
      setT(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Belem",
        })
      );
    f();
    const id = setInterval(f, 10_000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{t}</span>;
}

/* ---------- grain fílmico global ---------- */
const NOISE = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>")`;

export function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[96] opacity-[0.07] mix-blend-overlay"
      style={{ backgroundImage: NOISE }}
    />
  );
}
