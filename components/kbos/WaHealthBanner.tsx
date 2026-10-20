"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Faixa vermelha fixa quando o monitor detecta o WhatsApp fora do ar. Só aparece para o admin. */
export default function WaHealthBanner() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/admin/whatsapp/health", { cache: "no-store" });
        if (r.ok && alive) setDown(!!(await r.json()).down);
      } catch { /* silencioso */ }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!down) return null;
  return (
    <Link href="/admin/whatsapp" role="alert" className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-red-400/50 bg-red-950 px-4 py-2 text-sm text-red-100">
      <span className="min-w-0"><b>WhatsApp fora do ar.</b> O assistente não responde até reconectar.</span>
      <span className="shrink-0 font-bold underline">Reconectar →</span>
    </Link>
  );
}
