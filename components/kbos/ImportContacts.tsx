"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImportRecord, PlanItem } from "@/lib/kbos/contact-import";

type Source = "google" | "whatsapp" | "arquivo";
type Summary = { total: number; create: number; merge: number; same: number; conflict: number; review: number };
type Preview = { records: ImportRecord[]; plan: PlanItem[]; summary: Summary; notice: string };

const fmtPhone = (n: string | null | undefined) => (n ? n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "+55 ($1) $2-$3") : "");
const SRC: Record<string, string> = { google: "Google", whatsapp: "WhatsApp", arquivo: "Arquivo" };

/** Importar contatos (Google, WhatsApp, arquivo): lê, junta a mesma pessoa, mostra o que muda e só grava o que você confirmar. */
export default function ImportContacts({ onClose, onDone, googleSession, startError }: { onClose: () => void; onDone: () => void; googleSession?: string | null; startError?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(startError || "");
  const [pv, setPv] = useState<Preview | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set()); // pessoas desmarcadas
  const [pick, setPick] = useState<Record<string, string>>({}); // número atual escolhido
  const [showSame, setShowSame] = useState(false);
  const [done, setDone] = useState<string>("");
  const file = useRef<HTMLInputElement>(null);

  // Puxa do WhatsApp a foto de quem está sem foto (clientes primeiro), em lotes, até acabar.
  async function fetchPhotos() {
    setBusy(true); setMsg("Buscando fotos no WhatsApp…"); setDone("");
    let found = 0, checked = 0;
    try {
      for (let i = 0; i < 40; i++) {
        const r = await fetch("/api/admin/contacts/photos", { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não consegui buscar as fotos.");
        found += j.found; checked += j.checked;
        setMsg(`Buscando fotos… ${found} encontrada(s) em ${checked} contato(s); faltam ${j.remaining}.`);
        if (!j.checked || j.remaining === 0) break;
      }
      setMsg(`Pronto: ${found} foto(s) encontrada(s) em ${checked} contato(s). Quem escondeu a foto no WhatsApp continua com a inicial.`);
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  async function load(source: Source, text?: string, sessionId?: string) {
    setBusy(true); setMsg(""); setPv(null); setDone("");
    try {
      const r = await fetch("/api/admin/contacts/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, text, sessionId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui ler os contatos.");
      setPv(j); setOff(new Set(j.plan.filter((p: PlanItem) => p.action === "conflict").map((p: PlanItem) => p.id))); setPick({});
      if (!j.plan.length) setMsg(j.notice || "Nenhum contato encontrado nessa fonte.");
      else if (j.notice) setMsg(j.notice);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!googleSession) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a prévia uma vez quando volta do Google.
    void load("google", undefined, googleSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSession]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 8_000_000) { setMsg("Arquivo grande demais (máx. 8 MB). Divida em partes."); return; }
    await load("arquivo", await f.text());
  }

  const visible = useMemo(() => (pv?.plan ?? []).filter((p) => showSame || !(p.action === "merge" && p.changes[0] === "Sem novidades")), [pv, showSame]);
  const chosen = (pv?.plan ?? []).filter((p) => !off.has(p.id) && p.action !== "conflict" && !(p.action === "merge" && p.changes[0] === "Sem novidades"));

  async function commit() {
    if (!pv) return;
    setBusy(true); setMsg("");
    const decisions: Record<string, { skip?: boolean; primaryPhone?: string }> = {};
    for (const p of pv.plan) {
      if (off.has(p.id)) decisions[p.id] = { skip: true };
      else if (pick[p.id]) decisions[p.id] = { primaryPhone: pick[p.id] };
    }
    try {
      const r = await fetch("/api/admin/contacts/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ records: pv.records, decisions }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
      setDone(`${j.created} novo(s), ${j.merged} atualizado(s)${j.conflicts ? `, ${j.conflicts} para juntar à mão` : ""}${j.failed ? `, ${j.failed} falharam` : ""}.`);
      setPv(null); onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  const toggle = (id: string) => setOff((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" role="dialog" aria-label="Importar contatos">
        <div className="flex items-center justify-between">
          <h2 className="font-display kb-ink text-xl">Importar contatos</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
        </div>

        {!pv && (
          <div className="grid gap-2">
            <a className="kb-btn min-h-12 text-center" href="/api/admin/contacts/import/google/start">Importar do Google Contatos</a>
            <button type="button" className="kb-btn-ghost min-h-12" disabled={busy} onClick={() => load("whatsapp")}>Contatos do WhatsApp conectado</button>
            <button type="button" className="kb-btn-ghost min-h-12" disabled={busy} onClick={() => file.current?.click()}>Arquivo (.vcf ou .csv)</button>
            <button type="button" className="kb-btn-ghost min-h-12" disabled={busy} onClick={fetchPhotos}>Buscar fotos de perfil do WhatsApp</button>
            <input ref={file} type="file" accept=".vcf,.csv,text/vcard,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="kb-faint text-[12px]">
              O mesmo contato vindo de fontes diferentes vira um só. Se houver dois números, o KBOS confere no WhatsApp qual está ativo, deixa esse na ficha e guarda o antigo só para reconhecer a pessoa depois. Instagram e Facebook não liberam contatos: use um arquivo com a coluna Instagram/Facebook ou digite o @ na ficha.
            </p>
          </div>
        )}
        {busy && <div className="kb-skel h-16 w-full" aria-busy="true" />}
        {msg && <p role="status" className="kb-tag w-full justify-start rounded-xl! px-3! py-2! text-sm">{msg}</p>}
        {done && <p role="status" className="kb-tag w-full justify-start rounded-xl! px-3! py-2! text-sm">Pronto: {done}</p>}

        {pv && pv.plan.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className="kb-tag">{pv.summary.create} novos</span>
              <span className="kb-tag">{pv.summary.merge} com novidades</span>
              <span className="kb-tag">{pv.summary.same} já iguais</span>
              {pv.summary.review > 0 && <span className="kb-tag soon">{pv.summary.review} para conferir o número</span>}
              {pv.summary.conflict > 0 && <span className="kb-tag late">{pv.summary.conflict} em conflito</span>}
            </div>
            <label className="kb-muted flex items-center gap-2 text-sm"><input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> Mostrar também os que não mudam</label>
            <ul className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((p) => {
                const cands = [...new Set([p.phone.primary, ...p.phone.former, ...p.person.phones.map((x) => x.number)].filter(Boolean) as string[])];
                const disabled = p.action === "conflict";
                return (
                  <li key={p.id} className="kb-glass min-w-0 space-y-1 rounded-2xl! p-3">
                    <label className="flex min-w-0 items-start gap-3">
                      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={!off.has(p.id)} disabled={disabled} onChange={() => toggle(p.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="kb-ink block truncate text-[15px]">{p.person.name || p.person.emails[0] || fmtPhone(p.phone.primary) || "Sem nome"}</span>
                        <span className="kb-faint block truncate text-[12px]">
                          {p.action === "create" ? "Novo" : p.action === "merge" ? `Atualiza ${p.targetName}` : "Conflito"} · {p.person.sources.map((s) => SRC[s]).join(" + ")}
                        </span>
                      </span>
                    </label>
                    <ul className="kb-muted space-y-0.5 pl-8 text-[12px]">{p.changes.map((c) => <li key={c} className="break-words">{c}</li>)}</ul>
                    {p.phone.needsReview && cands.length > 1 && !off.has(p.id) && (
                      <fieldset className="pl-8">
                        <legend className="kb-faint mb-1 text-[11px] uppercase tracking-wide">Qual número é o atual?</legend>
                        <div className="flex flex-wrap gap-2">
                          {cands.map((n) => (
                            <button key={n} type="button" className="kb-chip min-h-11" aria-pressed={(pick[p.id] ?? p.phone.primary) === n} onClick={() => setPick((s) => ({ ...s, [p.id]: n }))}>{fmtPhone(n)}</button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy || !chosen.length} onClick={commit}>{busy ? "Salvando…" : `Importar ${chosen.length}`}</button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => { setPv(null); setMsg(""); }}>Voltar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
