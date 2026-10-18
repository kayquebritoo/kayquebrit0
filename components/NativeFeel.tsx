"use client";
import { useEffect } from "react";

/* Comportamento de app nativo no navegador/PWA:
   - sem zoom por pinça (iOS ignora user-scalable em alguns casos; o toque duplo já é
     bloqueado por touch-action: manipulation no CSS);
   - marca o modo "instalado" (standalone) para o CSS ajustar as áreas seguras. */
export default function NativeFeel() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) document.documentElement.classList.add("is-standalone");

    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop as EventListener);
    document.addEventListener("gesturechange", stop as EventListener);
    return () => {
      document.removeEventListener("gesturestart", stop as EventListener);
      document.removeEventListener("gesturechange", stop as EventListener);
    };
  }, []);
  return null;
}
