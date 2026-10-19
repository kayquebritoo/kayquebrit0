"use client";
import { useEffect, useState } from "react";
import type { SaleSnapshot } from "@/lib/kbos/sales";
import type { SalePlan } from "@/lib/kbos/sale-plan";
import CompanyProfileFields from "@/components/kbos/planning/CompanyProfileFields";
import type { CompanyProfile } from "@/lib/kbos/planning-model";
import { formatBRL } from "@/lib/kbos/budget-calc";

type ProposalData = { snapshot: SaleSnapshot; plan: SalePlan; acceptedAt: string | null; expiresAt: string; companyProfile: CompanyProfile; planningUrl: string | null };
const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
export default function Proposal({ token }: { token: string }) {
  const [data, setData] = useState<ProposalData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [contract, setContract] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/proposals/${token}/`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); if (active) setData(j); }).catch((e) => { if (active) setError(e.message || "Não foi possível carregar a proposta."); });
    return () => { active = false; };
  }, [token]);
  async function accept(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch(`/api/proposals/${token}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: name, contractAccepted: contract, manualAccepted: manual, companyProfile: data?.companyProfile }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setData((v) => v ? { ...v, acceptedAt: j.acceptedAt, planningUrl: j.planningUrl } : v);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar o aceite."); }
    finally { setBusy(false); }
  }
  const s = data?.snapshot;
  return <div className="kbos min-h-screen"><main className="mx-auto max-w-3xl px-4 py-12">
    <p className="mb-4 text-sm tracking-widest">KAYQUE BRITO · PROPOSTA COMERCIAL</p>
    {error && <p role="alert" className="kb-glass mb-6 p-5 text-red-400">{error}</p>}
    {!s || !data ? !error && <p>Carregando proposta…</p> : <>
      <h1 className="text-3xl font-semibold">{s.title}</h1><p className="my-3">{s.code} · Para {s.clientName}</p>
      {data.acceptedAt && <p role="status" className="kb-glass my-6 p-6">Aceite registrado em {new Date(data.acceptedAt).toLocaleString("pt-BR", { timeZone: "America/Belem" })}. Seu projeto foi criado. O início depende das condições de pagamento e materiais combinados.</p>}
      <section className="kb-glass my-6 space-y-4 p-5"><h2 className="text-xl font-semibold">Escopo e cronograma</h2>
        {s.items.map((i, index) => <div className="kb-row flex flex-wrap justify-between gap-3" key={index}><div>{i.service} · {i.quantity} un.{i.description && <p className="text-sm">{i.description}</p>}{i.date && <p>{date(i.date)}</p>}</div><span>{formatBRL(i.total)}</span></div>)}
        <p>Início: {date(data.plan.startDate)} · {data.plan.service === "mensal" ? `Término do plano (${data.plan.months} meses)` : "Entrega final"}: {date(data.plan.deliveryDate)}</p>
        <h3 className="font-semibold">Condição de pagamento</h3>
        {s.installments.map((i, index) => <p key={index}>{i.label}: {formatBRL(i.amount)} · {i.onAcceptance ? "no aceite" : date(i.dueDate)}</p>)}
        {s.bankInfo && <p className="whitespace-pre-line">{s.bankInfo}</p>}
      </section>
      <section className="kb-glass my-6 space-y-5 p-5"><h2 className="text-xl font-semibold">Instrumento Particular de Prestação de Serviços</h2>
        <p>Contratado: Kayque Jonathan Brito, Belém/PA. Contratante: {data.companyProfile.legalName || data.companyProfile.companyName || s.clientName}{data.companyProfile.document ? ` · ${data.companyProfile.document}` : ""}. O escopo e o cronograma acima integram este instrumento.</p>
        {s.clauses.map((c) => <div key={c.title}><h3 className="mb-2 font-semibold">{c.title}</h3><p>{c.body}</p></div>)}
        {s.terms && <div><h3 className="font-semibold">Observações da proposta</h3><p className="whitespace-pre-line">{s.terms}</p></div>}
      </section>
      {(data.plan.manualUrl || data.plan.attachments?.length) ? <section className="kb-glass my-6 space-y-3 p-5"><h2 className="text-xl font-semibold">Manual de Identidade e referências</h2>
        {data.plan.manualUrl && <a className="kb-btn-ghost min-h-12" href={data.plan.manualUrl} target="_blank" rel="noreferrer">Ler Manual de Identidade</a>}
        {data.plan.attachments?.map((a, i) => <div key={i}><a className="kb-btn-ghost min-h-12 max-w-full break-all" href={a.kind === "file" ? `/api/proposals/${token}/files/${a.fileId}/` : a.url} target="_blank" rel="noreferrer">{a.kind === "file" ? "Baixar" : "Abrir"} {a.name}</a><p className="mt-1 text-sm kb-muted">{a.role === "manual" ? "Manual de Identidade" : "Referência"}</p></div>)}
      </section> : null}
      {data.planningUrl && <a href={data.planningUrl} className="kb-btn my-4 w-full">Abrir minha marca e planejamento →</a>}
      {!data.acceptedAt && <section className="kb-glass my-6 p-5"><p className="cp-eyebrow">ANTES DE ASSINAR</p><h2 className="mb-3 text-xl font-semibold">Sua empresa, sua marca</h2><p className="mb-6 text-sm kb-muted">Confira os dados e envie a identidade atual da empresa. Essas informações serão confirmadas com sua assinatura e vão iniciar seu planejamento estratégico.</p>
        <CompanyProfileFields value={data.companyProfile} onChange={(companyProfile)=>setData(v=>v?{...v,companyProfile}:v)} uploadUrl={`/api/proposals/${token}/brand-files/`} assetUrl={(id,preview)=>`/api/proposals/${token}/brand-files/${id}/${preview?'?preview=1':''}`} onBusy={setUploading} />
      </section>}
      {!data.acceptedAt && <form onSubmit={accept} className="kb-glass my-6 space-y-4 p-5">
        <h2 className="text-xl font-semibold">Assinatura eletrônica simples</h2>
        <p>Ao confirmar, você aceita esta proposta e autoriza a abertura do projeto e das cobranças descritas acima.</p>
        <label className="kb-field">Nome completo de quem aceita<input className="kb-control min-h-12 text-base" autoComplete="name" required minLength={3} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="flex min-h-12 items-center gap-3"><input type="checkbox" required checked={contract} onChange={(e) => setContract(e.target.checked)} />Li e aceito o orçamento e todas as cláusulas do contrato.</label>
        <label className="flex min-h-12 items-center gap-3"><input type="checkbox" required checked={manual} onChange={(e) => setManual(e.target.checked)} />{(data.plan.manualUrl || data.plan.attachments?.length) ? "Revisei os dados da minha empresa e aceito o Manual de Identidade e os materiais da marca apresentados nesta proposta." : "Revisei os dados da minha empresa e enviarei o Manual de Identidade e os materiais da marca (ou aceito a sugestão do contratado), conforme o contrato."}</label>
        <button className="kb-btn min-h-12 w-full" disabled={busy || uploading || !contract || !manual || !data.companyProfile.companyName.trim()}>{busy ? "Registrando…" : "Aceitar e assinar proposta"}</button>
        <p className="text-sm">Link válido até {new Date(data.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Belem" })}.</p>
      </form>}
    </>}
  </main></div>;
}
