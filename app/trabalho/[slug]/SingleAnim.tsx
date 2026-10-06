"use client";
import { useEffect } from "react";
import gsap from "gsap";

export default function SingleAnim() {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".anim-in",
        { y: 28, opacity: 0, filter: "blur(6px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.05,
          duration: 0.55,
          ease: "expo.out",
          clearProps: "filter",
        }
      );
      // barra de progresso de leitura
      const bar = document.querySelector(".single-progress");
      if (bar) {
        const update = () => {
          const h = document.documentElement;
          const max = h.scrollHeight - h.clientHeight;
          const p = max > 0 ? h.scrollTop / max : 0;
          gsap.set(bar, { scaleX: p });
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
        return () => window.removeEventListener("scroll", update);
      }
    });
    return () => ctx.revert();
  }, []);
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[70] h-[2px] origin-left bg-white/80"
    >
      <div className="single-progress h-full w-full origin-left scale-x-0 bg-gradient-to-r from-[#9DB8E8] to-white" />
    </div>
  );
}
