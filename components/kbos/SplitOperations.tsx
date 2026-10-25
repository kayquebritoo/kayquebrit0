"use client";
import { useCallback, useEffect, useState } from "react";

type Plan = {
  parent: { parentId: string | null }; children: { id: string; titulo: string }[]; total: number; semMarca: number;
  marcas: { brand: string; total: number; ocultos: number; de: string | null; ate: string | null }[];
  desfazer: { id: string; createdAt: string; moved: number }[];
};

/** Painel do projeto: separa um projeto que mistura empresas (campo "empresa" dos posts) em operações. Plano primeiro, aplicar com confirmação, desfazer quando quiser. */
export default function SplitOperations({ projectId, onDone }: { projectId: string; onDone: () => void | Promise<void> }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/social/split/?projectId=${projectId}`, { cache: "no-store" }).catch(() => null);
    setPlan(r?.ok ? await r.json() : null);
  }, [projectId]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  if (!plan || plan.parent.parentId || (plan.marcas.length < 2 && !plan.desfazer.length)) return null;
  const mapping = plan.marcas.map((m) => ({ brand: m.brand, titulo: (names[m.brand] ?? "").trim() })).filter((m) => m.titulo);

  async function apply() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/social/split/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, confirm, mapping }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui separar.");
      setMsg(`Feito: ${j.moved} posts movidos, ${j.created} operação(ões) criada(s). Dá para desfazer abaixo.`); setConfirm("");
      await load(); await onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function undo(id: string) {
    if (!window.confirm("Desfazer a separação? Os posts voltam para este projeto; operações criadas e vazias são apagadas.")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/admin/social/split/?moveId=${id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui desfazer.");
      setMsg(`Desfeito: ${j.back} posts voltaram.`); await load(); await onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  return (
    <div className="kb-glass mt-4 grid gap-3 p-4">
      <button type="button" className="kb-chip min-h-11 justify-self-start" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Separar por operação {open ? "▴" : "▾"}</button>
      {open && (
        <>
          <p className="kb-faint text-xs">Este projeto tem posts de {plan.marcas.length} empresas. Cada empresa pode virar uma operação com calendário e indicadores próprios; contrato e financeiro ficam aqui. Só posts com a empresa marcada são movidos{plan.semMarca ? `; ${plan.semMarca} sem empresa ficam aqui para revisão` : ""}. Nada é apagado.</p>
          {plan.marcas.map((m) => (
            <label key={m.brand} className="kb-field">
              <span>{m.brand} · {m.total} post{m.total === 1 ? "" : "s"}{m.de ? ` (${m.de}${m.ate !== m.de ? ` a ${m.ate}` : ""})` : ""}</span>
              <input className="kb-control min-h-11" list={`ops-${projectId}`} placeholder="Nome da operação (vazio = não mover)" value={names[m.brand] ?? ""} onChange={(e) => setNames((n) => ({ ...n, [m.brand]: e.target.value }))} />
            </label>
          ))}
          <datalist id={`ops-${projectId}`}>{plan.children.map((c) => <option key={c.id} value={c.titulo} />)}</datalist>
          {mapping.length > 0 && (
            <label className="kb-field"><span>Para confirmar, digite SEPARAR</span><input className="kb-control min-h-11" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} /></label>
          )}
          <button type="button" className="kb-btn min-h-11" disabled={busy || !mapping.length || confirm !== "SEPARAR"} onClick={() => void apply()}>Separar {mapping.reduce((s, m) => s + (plan.marcas.find((x) => x.brand === m.brand)?.total ?? 0), 0)} posts</button>
          {plan.desfazer.map((d) => (
            <button key={d.id} type="button" className="kb-btn-ghost min-h-11" disabled={busy} onClick={() => void undo(d.id)}>Desfazer separação de {new Date(d.createdAt).toLocaleDateString("pt-BR")} ({d.moved} posts)</button>
          ))}
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </>
      )}
    </div>
  );
}
