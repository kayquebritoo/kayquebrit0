"use client";
import { useState } from "react";

const DONE: Record<string, string> = { aprovado: "Aprovado", reprovado: "Ajuste pedido" };

export default function ApproveButtons({ projectId, fileId, status }: { projectId: string; fileId: string; status: string }) {
  const [state, setState] = useState(status);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function act(next: "aprovado" | "reprovado") {
    if (next === "reprovado" && feedback.trim().length < 3) { setError("Conte em poucas palavras o que precisa ajustar."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, feedback: next === "reprovado" ? feedback.trim() : undefined }),
      });
      if (!res.ok) throw new Error();
      setState(next);
      setAsking(false);
    } catch {
      setError("Não consegui registrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (state !== "enviado") {
    return <span className={`kb-tag ${state === "aprovado" ? "" : "late"}`}>{DONE[state] ?? state}</span>;
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      {!asking ? (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => act("aprovado")} className="kb-btn min-h-11 flex-1 sm:flex-none">Aprovar</button>
          <button disabled={busy} onClick={() => setAsking(true)} className="kb-btn-ghost min-h-11 flex-1 sm:flex-none">Pedir ajuste</button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          <textarea className="kb-control min-h-20" autoFocus value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="O que precisa ajustar?" aria-label="O que precisa ajustar" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => act("reprovado")} className="kb-btn min-h-11 flex-1">Enviar pedido</button>
            <button disabled={busy} onClick={() => { setAsking(false); setError(""); }} className="kb-btn-ghost min-h-11">Voltar</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
