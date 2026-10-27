"use client";
import { useState } from "react";
export default function CalendarExport({ projectId, month, compact = false }: { projectId: string; month: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const query = new URLSearchParams({ projectId });
  return <>
    <button type="button" className={compact ? "kb-btn-ghost inline-flex min-h-12 min-w-12 items-center justify-center" : "kb-btn min-h-11"} aria-label="Exportar calendário" title="Exportar calendário" disabled={!projectId} onClick={() => setOpen(true)}>{compact ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m-4 4 4-4 4 4M4 16v5h16v-5" /></svg> : "Exportar calendário"}</button>
    {open && <div className="kb-modal-back" onClick={() => setOpen(false)}><div className="kb-modal space-y-4" role="dialog" aria-modal="true" aria-label="Exportar calendário" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="font-display kb-ink text-lg">Exportar calendário</h2><button type="button" aria-label="Fechar exportação" className="kb-chip min-h-11" onClick={() => setOpen(false)}>×</button></div>
      <p className="kb-muted text-sm">O backup completo inclui todos os meses, operações, roteiros, legendas, registros ocultos e status por rede. Guarde o JSON para preservar o histórico.</p>
      <a className="kb-btn min-h-12 flex items-center justify-center" href={`/api/admin/social/export?${query}&format=json`}>Baixar backup completo (JSON)</a>
      <a className="kb-btn-ghost min-h-12 flex items-center justify-center" href={`/api/admin/social/export?${query}&format=csv&month=${month}`}>Baixar mês em CSV</a>
      <p className="kb-faint text-xs">Os arquivos são baixados para o seu dispositivo. A exportação não envia arquivos automaticamente ao Google Drive.</p>
    </div></div>}
  </>;
}
