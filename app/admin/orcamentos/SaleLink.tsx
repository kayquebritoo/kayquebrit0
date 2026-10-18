"use client";
import { useEffect, useRef, useState } from "react";
import { localDay, planEndDate, SERVICE_LABELS, type SaleMaterial } from "@/lib/kbos/sale-plan";
import { formatBRL } from "@/lib/kbos/budget-calc";
import SaleMaterials from "./SaleMaterials";

export default function SaleLink({ budgetId, contactId, monthly = false, amount = 0, initialStart, onClose, onCreated }: { budgetId: string; contactId: string | null; monthly?: boolean; amount?: number; initialStart?: string; onClose: () => void; onCreated: () => void }) {
  const [service, setService] = useState(monthly ? "mensal" : "branding");
  const [startDate, setStart] = useState(initialStart || localDay());
  const [deliveryDate, setDelivery] = useState("");
  const [months, setMonths] = useState(1);
  const [attachments, setAttachments] = useState<SaleMaterial[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<{ id: string; title: string; contactId: string; stage: string }[]>([]);
  const [dealId, setDealId] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const endDate = service === "mensal" ? planEndDate(startDate, months) : deliveryDate;
  useEffect(() => {
    let active = true;
    fetch("/api/deals/").then((r) => r.ok ? r.json() : { items: [] }).then((j) => {
      if (active) setDeals((j.items || []).filter((d: { contactId: string; stage: string }) => d.contactId === contactId && !["won", "lost"].includes(d.stage)));
    }).catch(() => { /* Uma negociação nova será criada se a lista estiver indisponível. */ });
    return () => { active = false; };
  }, [contactId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), select:not(:disabled), a[href]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      if (uploading) throw new Error("Aguarde o envio dos arquivos terminar.");
      const r = await fetch(`/api/budgets/${budgetId}/sale/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service, startDate, deliveryDate: endDate, months, attachments, dealId: dealId || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível gerar o link.");
      setUrl(j.url); onCreated();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao gerar link."); }
    finally { setBusy(false); }
  }
  return <div className="kb-modal-back" onClick={onClose}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sale-title" className="kb-modal w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-4"><h2 id="sale-title" className="text-xl font-semibold">Conectar venda</h2><button type="button" className="kb-btn min-h-12" onClick={onClose} autoFocus>Fechar</button></div>
      <p className="my-4 text-sm kb-muted">Prepare o período e os materiais que o cliente vai revisar. O aceite abre o projeto, organiza as cobranças e atualiza a agenda e o funil.</p>
      {error && <p role="alert" className="my-3 text-red-400">{error}</p>}
      {url ? <div className="space-y-4"><label className="kb-field">Link de aceite<input className="kb-control text-base" readOnly value={url} /></label>
        <button className="kb-btn min-h-12" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError("Selecione e copie o link acima."); } }}>{copied ? "Link copiado" : "Copiar link"}</button>
        <a className="kb-btn min-h-12" href={url} target="_blank" rel="noreferrer">Revisar proposta</a>
        <p className="text-sm">Envie este link ao cliente após revisar as condições. A primeira cobrança vence no aceite; as demais seguem o cronograma publicado.</p>
      </div> : <form onSubmit={submit} className="space-y-4">
        <label className="kb-field">Negociação no funil<select className="kb-control text-base" value={dealId} onChange={(e) => setDealId(e.target.value)}><option value="">Criar negociação (ou reutilizar a deste link)</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
        <label className="kb-field">Modelo do projeto<select className="kb-control min-h-12 text-base" value={service} onChange={(e) => setService(e.target.value)}>{Object.entries(SERVICE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="kb-field">Início<input className="kb-control min-h-12 text-base" type="date" required min={localDay()} value={startDate} onChange={(e) => setStart(e.target.value)} /></label>
          {service === "mensal" ? <label className="kb-field">Duração do plano (meses)<input className="kb-control min-h-12 text-base" type="number" min={1} max={36} required value={months || ""} onChange={(e) => setMonths(Number(e.target.value))} /></label>
            : <label className="kb-field">Entrega final<input className="kb-control min-h-12 text-base" type="date" required min={startDate} value={deliveryDate} onChange={(e) => setDelivery(e.target.value)} /></label>}
        </div>
        {service === "mensal" && endDate && <div className="rounded-xl border border-[var(--kb-line)] p-4 text-sm" aria-live="polite"><p>Término calculado: <strong>{endDate.split("-").reverse().join("/")}</strong></p><p className="mt-2">{months} mensalidade(s) de {formatBRL(amount)} · Total do plano: <strong>{formatBRL(amount * months)}</strong></p><p className="mt-2 kb-muted">A duração define quantas mensalidades serão geradas. A primeira vence no aceite; as seguintes, no dia 5 dos próximos meses. Sem multa rescisória.</p></div>}
        <SaleMaterials budgetId={budgetId} value={attachments} onChange={setAttachments} onBusy={setUploading} />
        <p className="text-xs kb-muted">Um novo link substitui o anterior. Confira a condição de pagamento no orçamento antes de gerar.</p>
        <button className="kb-btn min-h-12 w-full" disabled={busy || uploading}>{uploading ? "Enviando arquivos…" : busy ? "Gerando…" : "Gerar link de aceite"}</button>
      </form>}
    </section>
  </div>;
}
