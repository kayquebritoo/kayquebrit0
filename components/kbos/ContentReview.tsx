"use client";

import { useId, useState } from "react";
import type { ReconciliationReport } from "@/lib/kbos/social-reconciliation";

const LABEL: Record<string, string> = { roteiro: "Roteiro", captacao: "Captação", producao: "Em edição", aprovacao: "Aguardando cliente", ajustes: "Ajustes", aprovado: "Aprovado", agendado: "Agendado", postado: "Postado", erro: "Erro ao postar" };

export default function ContentReview({ projectId, month, onOpenPost }: { projectId: string; month: string; onOpenPost: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const panelId = useId();

  async function load() {
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ projectId, month });
      const response = await fetch(`/api/admin/social/reconciliation?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não consegui conferir os conteúdos.");
      setReport(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não consegui conferir os conteúdos.");
    } finally { setBusy(false); }
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
              <p className="kb-faint text-xs">Títulos ou legendas semelhantes no mesmo dia e na mesma empresa são candidatos à revisão. Esta conferência preserva todos os registros e etapas.</p>
              {report.groups.length === 0 ? <p className="kb-muted py-2 text-sm">Nenhum candidato a repetido encontrado neste mês. Isso não confirma a publicação nas redes.</p> : report.groups.map(group => (
                <details key={group.items.map(item => item.id).sort().join(":")} className="rounded-xl border border-white/10 px-3">
                  <summary className="kb-ink min-h-11 cursor-pointer py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2">
                    <span className="break-words">{group.title}</span>
                    <span className="kb-faint ml-2 text-xs">{group.brand} · {group.day.split("-").reverse().join("/")} · {group.items.length} registros</span>
                  </summary>
                  {group.differences.length > 0 && <p className="kb-muted pb-2 text-xs">{group.differences.join(" · ")}</p>}
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
          <button type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => void load()}>{error ? "Tentar novamente" : "Atualizar conferência"}</button>
        </div>
      )}
    </section>
  );
}
