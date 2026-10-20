"use client";
import { useState } from "react";
import LumeMark from "@/components/kbos/lume/LumeMark";

export default function Lume() {
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null);
  const [pairErr, setPairErr] = useState("");
  async function gerarCodigo() {
    setPairErr("");
    try {
      const r = await fetch("/api/admin/lume/codigo", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setPair(await r.json());
    } catch { setPair(null); setPairErr("Não deu para gerar o código agora (token do Lume ausente?)."); }
  }
  return (
    <div className="kb-page mx-auto w-full max-w-3xl space-y-4 pb-10">
      <section className="lm-hero">
        <div className="aurora" aria-hidden><i className="o1" /><i className="o2" /><i className="o3" /></div>
        <div className="relative z-[2] max-w-2xl">
          <div className="flex items-center gap-4"><LumeMark size={56} animate title="Lume" /><span className="cp-eyebrow">LUME · ACERVO INTELIGENTE</span></div>
          <h1 className="font-display">Encontre o <em>momento</em> certo.</h1>
          <p className="kb-muted max-w-xl">Descreva a cena, cole um print ou fale. O Lume mostra os takes; você confere e baixa.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a className="kb-btn min-h-12" href="/api/admin/lume/entrar">Abrir o Lume ↗</a>
          </div>
          {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("erro") === "config" && (
            <p role="alert" className="mt-3 text-sm text-red-300">O KBOS ainda não tem o token do Lume (LUME_API_TOKEN) no servidor.</p>
          )}
        </div>
      </section>

      <details className="kb-glass p-5">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">Instalar no iPhone</summary>
        <div className="mt-3 space-y-3">
          <p className="kb-muted text-sm">Abra o Lume no Safari, toque em Compartilhar → Adicionar à Tela de Início. No primeiro acesso do app, digite o código abaixo.</p>
          <button type="button" className="kb-btn-ghost min-h-12" onClick={gerarCodigo}>Gerar código</button>
          {pair && (
            <p className="font-mono text-3xl font-bold tracking-[0.3em]" aria-live="polite">
              {pair.code} <span className="kb-faint text-xs font-normal tracking-normal">até {new Date(pair.expiresAt * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Belem" })}</span>
            </p>
          )}
          {pairErr && <p role="alert" className="text-sm text-red-300">{pairErr}</p>}
        </div>
      </details>
    </div>
  );
}
