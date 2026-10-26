"use client";

import { useId, useState } from "react";
import type { ReconciliationReport } from "@/lib/kbos/social-reconciliation";

const LABEL: Record<string, string> = { roteiro: "Roteiro", captacao: "Captação", producao: "Em edição", aprovacao: "Aguardando cliente", ajustes: "Ajustes", aprovado: "Aprovado", agendado: "Agendado", postado: "Postado", erro: "Erro ao postar" };

export default function ContentReview({ projectId, month, onOpenPost, onChanged }: { projectId: string; month: string; onOpenPost: (id: string) => void; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const panelId = useId();
  const [plans, setPlans] = useState<{ keeperId: string; version: string; safe: boolean; conflicts: string[]; sourceIds: string[] }[]>([]);
  const [moves, setMoves] = useState<{ id: string; count: number }[]>([]);

  async function load() {
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ projectId, month });
      const response = await fetch(`/api/admin/social/reconciliation?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui conferir os conteúdos.");
      setReport(data);
      const planResponse = await fetch(`/api/admin/social/consolidation?${query}`, { cache: "no-store" });
      const planData = await planResponse.json();
      if (!planResponse.ok) throw new Error(planData.error || "Não consegui conferir as cópias.");
      setPlans(planData.groups); setMoves(planData.moves);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não consegui conferir os conteúdos.");
    } finally { setBusy(false); }
  }

  async function consolidate(plan: typeof plans[number]) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/social/consolidation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, month, keeperId: plan.keeperId, version: plan.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui consolidar.");
      setMoves(cur => [...cur, { id: data.moveId, count: data.consolidated }]);
      onChanged(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function undo(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/social/consolidation?moveId=${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui desfazer.");
      setMoves(cur => cur.filter(m => m.id !== id)); onChanged(); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  function toggle() {
    setOpen(!open);
    if (!open && !report && !busy) void load();
  }

  return (
    <section className="kb-glass overflow-hidden p-3 sm:p-4" aria-label="Conferência de conteúdos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="kb-ink text-sm font-medium">Conferir possíveis repetidos</p>
          <p className="kb-faint mt-0.5 text-xs">Compare os registros do mês antes de consolidar a contagem.</p>
        </div>
        <button type="button" className="kb-btn-ghost min-h-11 shrink-0" aria-expanded={open} aria-controls={panelId} disabled={!projectId} onClick={toggle}>
          {open ? "Fechar conferência" : "Conferir"}
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-3 space-y-3 border-t border-white/10 pt-3" aria-busy={busy}>
          {busy && <p className="kb-muted text-sm" role="status">Conferindo os registros…</p>}
          {error && <p className="kb-tag late text-sm" role="alert">{error}</p>}
          {report && !busy && (
            <>
              <p className="kb-muted text-sm" role="status">
                {report.records} {report.records === 1 ? "registro visível" : "registros visíveis"} · {report.groups.length} {report.groups.length === 1 ? "grupo" : "grupos"} para conferir · {report.unidentified} sem empresa identificada.
              </p>
              <p className="kb-faint text-xs">Títulos ou legendas semelhantes no mesmo dia e na mesma empresa são candidatos à revisão. Consolidar mantém o registro mais avançado, complementa campos vazios e vincula as cópias sem apagá-las. Divergências ficam para revisão.</p>
              {report.groups.length === 0 ? <p className="kb-muted py-2 text-sm">Nenhum candidato a repetido encontrado neste mês. Isso não confirma a publicação nas redes.</p> : report.groups.map(group => (
                <details key={group.items.map(item => item.id).sort().join(":")} className="rounded-xl border border-white/10 px-3">
                  <summary className="kb-ink min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="break-words">{group.title}</span>
                    <span className="kb-faint ml-2 text-xs">{group.brand} · {group.day.split("-").reverse().join("/")} · {group.items.length} registros</span>
                  </summary>
                  {group.differences.length > 0 && <p className="kb-muted pb-2 text-xs">{group.differences.join(" · ")}</p>}
                  {(() => { const plan = plans.find(p => group.items.some(item => item.id === p.keeperId)); return plan ? <div className="pb-2">{plan.safe ? <button type="button" className="kb-btn min-h-11" disabled={busy} onClick={() => void consolidate(plan)}>Consolidar {plan.sourceIds.length + 1} cópias</button> : <p className="kb-faint text-xs">Revisão necessária: {plan.conflicts.join(" · ")}</p>}</div> : null; })()}
                  <div className="divide-y divide-white/10 pb-2">
                    {group.items.map(item => (
                      <button key={item.id} type="button" className="kb-row min-h-11 w-full gap-2 text-left" onClick={() => onOpenPost(item.id)}>
                        <span className="min-w-0 flex-1">
                          <span className="kb-ink block break-words text-sm">{item.title}</span>
                          <span className="kb-faint block text-xs">{item.source}{item.scheduledAt ? ` · ${new Date(item.scheduledAt).toLocaleTimeString("pt-BR", { timeZone: "America/Belem", hour: "2-digit", minute: "2-digit" })}` : ""} · Abrir conteúdo</span>
                        </span>
                        <span className="kb-tag shrink-0 text-xs">{LABEL[item.status] ?? item.status}</span>
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </>
          )}
          {moves.map(move => <p key={move.id} className="kb-muted text-sm">{move.count} cópia(s) vinculada(s). <button type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => void undo(move.id)}>Desfazer consolidação</button></p>)}
          <button type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => void load()}>{error ? "Tentar novamente" : "Atualizar conferência"}</button>
        </div>
      )}
    </section>
  );
}
