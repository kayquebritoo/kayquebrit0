"use client";
import { useRef, useState } from "react";

type Row = { key: string; date: string; descricao: string; valor: number; tipo: "entrada" | "saida"; categoria: string | null; duplicate: boolean };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dmy = (iso: string) => iso.split("-").reverse().join("/");

export default function ImportStatement({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scope, setScope] = useState<"pessoal" | "empresa">("pessoal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const r = await fetch("/api/admin/finance/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui ler o arquivo.");
      setRows(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      const fresh = rows.filter((r) => !r.duplicate).map(({ date, descricao, valor, tipo, categoria }) => ({ date, descricao, valor, tipo, categoria }));
      const r = await fetch("/api/admin/finance/import/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, rows: fresh }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui importar.");
      setResult(`${d.imported} lançamento${d.imported === 1 ? "" : "s"} importado${d.imported === 1 ? "" : "s"}${d.skipped ? `, ${d.skipped} já existiam` : ""}.`);
      setRows(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setBusy(false);
    }
  }

  const fresh = rows?.filter((r) => !r.duplicate) ?? [];
  const inn = fresh.filter((r) => r.tipo === "entrada").reduce((a, r) => a + r.valor, 0);
  const out = fresh.filter((r) => r.tipo === "saida").reduce((a, r) => a + r.valor, 0);

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal flex max-h-[88dvh] flex-col gap-3" role="dialog" aria-label="Importar extrato">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display kb-ink text-lg">Importar extrato</h2>
            <p className="kb-muted text-sm">Envie o extrato do PicPay (ou de outro banco) em CSV ou OFX. O que já foi importado não duplica.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>

        {result && <p role="status" className="kb-tag w-full justify-start rounded-xl! px-3! py-2! text-sm">{result}</p>}
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}

        {!rows && (
          <>
            <input ref={input} type="file" accept=".csv,.ofx,.txt,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <button type="button" className="kb-btn min-h-12" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Lendo…" : "Escolher arquivo do extrato"}</button>
          </>
        )}

        {rows && (
          <>
            <div className="kb-seg" role="group" aria-label="Onde lançar">
              {([["pessoal", "Pessoal"], ["empresa", "Empresa"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>{label}</button>
              ))}
            </div>
            <p className="kb-muted text-sm">
              <b className="kb-ink">{fresh.length}</b> novos · {rows.length - fresh.length} já existiam · entra {brl(inn)} · sai {brl(out)}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.slice(0, 200).map((r) => (
                <div key={r.key} className={`kb-row ${r.duplicate ? "opacity-50" : ""}`}>
                  <span className="min-w-0">
                    <span className="kb-ink block truncate text-sm">{r.descricao}</span>
                    <span className="kb-faint block text-xs">{dmy(r.date)}{r.categoria ? ` · ${r.categoria}` : ""}{r.duplicate ? " · já importado" : ""}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums text-sm ${r.tipo === "entrada" ? "text-[var(--kb-good)]" : ""}`}>{r.tipo === "entrada" ? "+" : "−"}{brl(r.valor)}</span>
                </div>
              ))}
              {rows.length > 200 && <p className="kb-faint py-2 text-center text-xs">Mostrando os 200 primeiros; todos serão importados.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy || fresh.length === 0} onClick={() => void commit()}>{busy ? "Importando…" : `Importar ${fresh.length}`}</button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => setRows(null)}>Trocar arquivo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
