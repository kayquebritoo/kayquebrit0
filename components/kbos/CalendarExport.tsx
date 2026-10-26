"use client";
import { useState } from "react";
export default function CalendarExport({ projectId, month }: { projectId: string; month: string }) {
  const [open, setOpen] = useState(false);
  const query = new URLSearchParams({ projectId });
  return <>
    <button type="button" className="kb-btn min-h-11" disabled={!projectId} onClick={() => setOpen(true)}>Exportar calendário</button>
    {open && <div className="kb-modal-back" onClick={() => setOpen(false)}><div className="kb-modal space-y-4" role="dialog" aria-modal="true" aria-label="Exportar calendário" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="font-display kb-ink text-lg">Exportar calendário</h2><button type="button" aria-label="Fechar exportação" className="kb-chip min-h-11" onClick={() => setOpen(false)}>×</button></div>
      <p className="kb-muted text-sm">O backup completo inclui todos os meses, operações, roteiros, legendas, registros ocultos e status por rede. Guarde o JSON para preservar o histórico.</p>
      <a className="kb-btn min-h-12 flex items-center justify-center" href={`/api/admin/social/export?${query}&format=json`}>Baixar backup completo (JSON)</a>
      <a className="kb-btn-ghost min-h-12 flex items-center justify-center" href={`/api/admin/social/export?${query}&format=csv&month=${month}`}>Baixar mês em CSV</a>
      <p className="kb-faint text-xs">Os arquivos são baixados para o seu dispositivo. A exportação não envia arquivos automaticamente ao Google Drive.</p>
    </div></div>}
  </>;
}
