"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function CategoryAnim() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".cat-in",
        { y: 36, opacity: 0, filter: "blur(6px)" },
        { y: 0, opacity: 1, filter: "blur(0px)", stagger: 0.07, duration: 0.8, ease: "expo.out", clearProps: "filter" }
      );
      gsap.fromTo(
        ".cat-cover",
        { scale: 1.12, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 1.2, ease: "expo.out" }
      );
      // flutuação suave do selo de preço
      gsap.to(".cat-float", { y: -8, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      // brilho varrendo o CTA
      gsap.fromTo(
        ".cat-cta-shine",
        { xPercent: -160 },
        { xPercent: 260, duration: 2.6, ease: "power2.inOut", repeat: -1, repeatDelay: 1.4 }
      );
    }, el);
    return () => ctx.revert();
  }, []);
  return <div ref={root} aria-hidden className="pointer-events-none absolute inset-0" />;
}
