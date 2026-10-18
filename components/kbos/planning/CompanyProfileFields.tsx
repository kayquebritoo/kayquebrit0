"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import type { BrandAsset, CompanyProfile } from "@/lib/kbos/planning-model";
import { MAX_UPLOAD_BYTES, UPLOAD_ACCEPT } from "@/lib/kbos/sale-file-types";

export default function CompanyProfileFields({ value, onChange, uploadUrl, assetUrl, onBusy }: {
  value: CompanyProfile; onChange: (v: CompanyProfile) => void; uploadUrl: string;
  assetUrl: (id: string, preview?: boolean) => string; onBusy?: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [category, setCategory] = useState<BrandAsset["category"]>("logo");
  const picker = useRef<HTMLInputElement>(null);
  const set = (key: keyof CompanyProfile, next: string) => onChange({ ...value, [key]: next });
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (value.assets.length + files.length > 30) { setError("Selecione até 30 arquivos da marca."); return; }
    setBusy(true); onBusy?.(true); setError("");
    let profile = value;
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error("O limite é 10 MB por arquivo.");
        const form = new FormData(); form.set("file", file);
        const r = await fetch(uploadUrl, { method: "POST", body: form });
        if (r.status === 413) throw new Error("O arquivo excede o limite do servidor (até 10 MB).");
        const j = await r.json(); if (!r.ok) throw new Error(j.error || "Não foi possível enviar o arquivo.");
        const a: BrandAsset = { fileId: j.item.id, name: j.item.name, mime: j.item.mime, size: j.item.size, sha256: j.item.sha256, category };
        profile = { ...profile, assets: [...profile.assets, a], logoId: category === "logo" ? a.fileId : profile.logoId };
        onChange(profile);
      }
    } catch(e) { setError(e instanceof Error ? e.message : "Falha no envio."); }
    finally { setBusy(false); onBusy?.(false); if (picker.current) picker.current.value = ""; }
  }
  const logo = value.assets.find((a) => a.fileId === value.logoId);
  return <fieldset disabled={busy} className="min-w-0 space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="kb-field">Nome da empresa<input className="kb-control" required maxLength={160} autoComplete="organization" value={value.companyName} onChange={(e) => set("companyName",e.target.value)} /></label>
      <label className="kb-field">Responsável<input className="kb-control" autoComplete="name" maxLength={160} value={value.contactName} onChange={(e) => set("contactName",e.target.value)} /></label>
    </div>
    <details className="cp-disclosure"><summary>Dados de contato e da empresa</summary><div className="grid gap-4 sm:grid-cols-2">
      {([['legalName','Razão social'],['document','CPF/CNPJ'],['email','E-mail'],['phone','WhatsApp'],['website','Site (https://)'],['instagram','Instagram'],['address','Endereço'],['city','Cidade'],['state','Estado'],['zip','CEP'],['segment','Segmento']] as const).map(([key,label]) => <label key={key} className="kb-field">{label}<input className="kb-control" type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'text'} maxLength={key === 'address' ? 500 : 200} value={value[key]} onChange={(e)=>set(key,e.target.value)} /></label>)}
    </div></details>
    <div className="cp-card">
      <h3 className="font-semibold">Logo e arquivos da marca</h3>
      <p className="mt-2 text-sm kb-muted">Envie sua logo atual ou uma nova versão. Vetores e patterns ficam disponíveis para download.</p>
      {logo && <div className="cp-logo-preview">{logo.mime && ["image/png","image/jpeg","image/webp","image/gif"].includes(logo.mime) ? <Image unoptimized width={360} height={180} src={assetUrl(logo.fileId,true)} alt={`Logo de ${value.companyName}`} /> : <span>{logo.name}</span>}</div>}
      <div className="mt-4 flex flex-wrap gap-3"><label className="kb-field flex-1">Tipo de arquivo<select className="kb-control" value={category} onChange={(e)=>setCategory(e.target.value as BrandAsset['category'])}><option value="logo">Logo</option><option value="vector">Vetor (SVG, AI, EPS, PDF)</option><option value="pattern">Pattern / textura</option><option value="manual">Manual da marca</option><option value="photo">Fotografia</option><option value="reference">Referência</option></select></label>
        <button type="button" className="kb-btn self-end" disabled={busy} onClick={()=>picker.current?.click()}>{busy ? "Enviando…" : category === 'logo' ? 'Enviar / alterar logo' : 'Enviar arquivos'}</button>
        <input ref={picker} type="file" className="hidden" multiple accept={UPLOAD_ACCEPT} aria-label="Arquivos da marca" onChange={(e)=>void upload(e.target.files)} />
      </div>
      {error && <p role="alert" className="mt-3 text-red-400">{error}</p>}
      <p role="status" className="mt-2 text-xs kb-muted">{busy ? 'Aguarde o envio terminar antes de continuar.' : 'Até 10 MB por arquivo. PNG/JPEG para visualizar a logo; SVG/AI/EPS são baixados como vetores.'}</p>
      <div className="mt-4 space-y-2">{value.assets.map((a)=> <div key={a.fileId} className="cp-file-row"><a href={assetUrl(a.fileId)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all py-3 text-sm">{a.name}</a>{a.category==='logo' && <button type="button" className="kb-btn-ghost" aria-pressed={value.logoId===a.fileId} onClick={()=>onChange({...value,logoId:a.fileId})}>{value.logoId===a.fileId?'Principal':'Usar logo'}</button>}<button type="button" className="kb-btn-ghost" aria-label={`Remover ${a.name}`} onClick={()=>onChange({...value,assets:value.assets.filter(v=>v.fileId!==a.fileId),logoId:value.logoId===a.fileId?null:value.logoId})}>Remover</button></div>)}</div>
    </div>
    <div><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Paleta de cores</h3><button type="button" className="kb-btn-ghost" disabled={value.colors.length>=12} onClick={()=>onChange({...value,colors:[...value.colors,{name:`Cor ${value.colors.length+1}`,hex:'#111111'}]})}>Adicionar cor</button></div>
      {!value.colors.length && <p className="mt-2 text-sm kb-muted">Adicione as cores da sua empresa. Se ainda não houver uma paleta definida, podemos construir isso juntos no planejamento.</p>}
      <div className="mt-4 space-y-3">{value.colors.map((color,i)=><div key={i} className="cp-color-edit"><input type="color" aria-label={`Escolher ${color.name}`} value={color.hex} onChange={(e)=>onChange({...value,colors:value.colors.map((c,n)=>n===i?{...c,hex:e.target.value}:c)})} /><label className="kb-field flex-1">Nome<input className="kb-control" maxLength={40} value={color.name} onChange={(e)=>onChange({...value,colors:value.colors.map((c,n)=>n===i?{...c,name:e.target.value}:c)})} /></label><span className="text-xs">{color.hex}</span><button type="button" className="kb-btn-ghost" aria-label={`Remover cor ${color.name}`} onClick={()=>onChange({...value,colors:value.colors.filter((_,n)=>n!==i)})}>×</button></div>)}</div>
    </div>
    <details className="cp-disclosure"><summary>Essência e objetivos da marca (opcional)</summary><div className="space-y-4">
      <label className="kb-field">Slogan<input className="kb-control" maxLength={200} value={value.tagline} onChange={(e)=>set('tagline',e.target.value)} /></label>
      {([['concept','O que sua marca representa?'],['audience','Quem você quer alcançar?'],['tone','Como a marca deve falar?'],['objective','Qual resultado você espera deste projeto?']] as const).map(([key,label])=><label key={key} className="kb-field">{label}<textarea className="kb-control" maxLength={4000} rows={3} value={value[key]} onChange={(e)=>set(key,e.target.value)} /></label>)}
    </div></details>
  </fieldset>;
}
