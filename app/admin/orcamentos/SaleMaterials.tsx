"use client";
import { useEffect, useRef, useState } from "react";
import type { SaleMaterial } from "@/lib/kbos/sale-plan";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/kbos/sale-file-types";

export default function SaleMaterials({ budgetId, value, onChange, onBusy }: {
  budgetId: string; value: SaleMaterial[]; onChange: (v: SaleMaterial[]) => void; onBusy: (v: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [linkName, setLinkName] = useState("");
  const [library, setLibrary] = useState<{ id: string; name: string; size: number; sha256: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`/api/budgets/${budgetId}/uploads/`).then(async (r) => { if (!r.ok) return; const j = await r.json(); if (active) setLibrary(j.items || []); }).catch(() => {});
    return () => { active = false; };
  }, [budgetId]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (files.length + value.length > 20) { setError("Adicione até 20 materiais por proposta."); return; }
    setBusy(true); onBusy(true); setError("");
    const next = [...value];
    try {
      for (const [index, file] of Array.from(files).entries()) {
        setProgress(`Enviando ${index + 1}/${files.length}: ${file.name}`);
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}: o limite é 10 MB por arquivo.`);
        const form = new FormData(); form.set("file", file);
        const r = await fetch(`/api/budgets/${budgetId}/uploads/`, { method: "POST", body: form });
        if (r.status === 413) throw new Error("O arquivo excede o limite de envio do servidor. Tente um arquivo menor ou use um link externo.");
        const j = await r.json(); if (!r.ok) throw new Error(j.error || `Falha ao enviar ${file.name}.`);
        setLibrary((prev) => [...prev, j.item]);
        next.push({ kind: "file", fileId: j.item.id, name: j.item.name, size: j.item.size, sha256: j.item.sha256,
          role: next.some((a) => a.role === "manual") ? "reference" : "manual" });
        onChange([...next]);
      }
      setProgress("Arquivos enviados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar o arquivo."); setProgress(""); }
    finally { setBusy(false); onBusy(false); if (picker.current) picker.current.value = ""; }
  }
  function addLink() {
    try {
      const url = new URL(link.trim());
      if (url.protocol !== "https:") throw new Error();
      if (value.length >= 20) { setError("Adicione até 20 materiais por proposta."); return; }
      onChange([...value, { kind: "link", url: url.href, name: linkName.trim() || url.hostname,
        role: value.some((a) => a.role === "manual") ? "reference" : "manual" }]);
      setLink(""); setLinkName(""); setError("");
    } catch { setError("Informe um link HTTPS válido."); }
  }
  return <fieldset className="space-y-3 rounded-2xl border border-[var(--kb-line-strong)] p-4" disabled={busy}>
    <legend className="px-1 font-semibold">Manual de Identidade e referências</legend>
    <p className="text-sm kb-muted">Opcional. Envie arquivos do dispositivo ou adicione links; se tiver o Manual de Identidade, marque-o. Se não tiver, o cliente envia a marca na página de aceite.</p>
    <input ref={picker} aria-label="Selecionar arquivos do dispositivo" type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files)} />
    <button type="button" className="kb-btn min-h-12" onClick={() => picker.current?.click()}>Enviar arquivos</button>
    <p className="text-xs kb-muted">PDF, Word, PowerPoint, planilhas, JPEG, PNG e outros. Até 10 MB por arquivo e 50 MB por orçamento.</p>
    <p role="status" className="text-sm">{progress}</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {library.filter((f) => !value.some((a) => a.kind === "file" && a.fileId === f.id)).map((f) => <button key={f.id} type="button" className="kb-btn-ghost min-h-12 w-full break-all text-left" disabled={value.length >= 20} onClick={() => onChange([...value, { kind: "file", fileId: f.id, name: f.name, size: f.size, sha256: f.sha256, role: value.some((a) => a.role === "manual") ? "reference" : "manual" }])}>Anexar arquivo já enviado: {f.name}</button>)}
    {value.map((a, index) => <div key={a.kind === "file" ? a.fileId : `${a.url}-${index}`} className="space-y-2 rounded-xl border border-[var(--kb-line)] p-3">
      <p className="break-all text-sm font-semibold">{a.name}</p>
      <p className="break-all text-xs kb-muted">{a.kind === "file" ? `Arquivo enviado${a.size ? ` · ${(a.size / 1024).toFixed(0)} KB` : ""}` : a.url}</p>
      <div className="flex gap-2"><select aria-label={`Tipo de material: ${a.name}`} className="kb-control" value={a.role} onChange={(e) => onChange(value.map((item, i) => i === index ? { ...item, role: e.target.value as "manual" | "reference" } : item))}><option value="manual">Manual de Identidade</option><option value="reference">Referência</option></select>
        <button type="button" className="kb-btn-ghost" aria-label={`Remover ${a.name} da proposta`} onClick={() => onChange(value.filter((_, i) => i !== index))}>Remover</button></div>
    </div>)}
    <label className="kb-field">Link externo<input className="kb-control" type="url" placeholder="https://drive.google.com/…" value={link} onChange={(e) => setLink(e.target.value)} /></label>
    <label className="kb-field">Nome do link (opcional)<input className="kb-control" maxLength={200} placeholder="Ex.: Manual da marca" value={linkName} onChange={(e) => setLinkName(e.target.value)} /></label>
    <button type="button" className="kb-btn-ghost min-h-12" onClick={addLink} disabled={!link.trim()}>Adicionar link</button>
  </fieldset>;
}
