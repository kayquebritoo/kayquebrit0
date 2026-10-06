"use client";
import { useState } from "react";

export default function ApproveButtons({ projectId, fileId, status }: { projectId: string; fileId: string; status: string }) {
  const [state, setState] = useState(status);
  const [busy, setBusy] = useState(false);

  async function act(next: "aprovado" | "reprovado") {
    let feedback: string | undefined;
    if (next === "reprovado") {
      feedback = prompt("O que precisa ajustar?") || undefined;
      if (feedback === undefined) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, feedback }),
      });
      if (!res.ok) throw new Error("Falha.");
      setState(next);
    } catch {
      alert("Não foi possível registrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (state !== "enviado") {
    return (
      <span className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${state === "aprovado" ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>
        {state}
      </span>
    );
  }
  return (
    <div className="flex gap-2">
      <button disabled={busy} onClick={() => act("aprovado")} className="rounded-full bg-emerald-400 px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black disabled:opacity-50">
        Aprovar
      </button>
      <button disabled={busy} onClick={() => act("reprovado")} className="rounded-full border border-white/25 px-4 py-1.5 text-[12px] uppercase tracking-[0.15em] text-white/80 disabled:opacity-50">
        Ajustar
      </button>
    </div>
  );
}
