"use client";
import { useCallback, useEffect, useState } from "react";

type Metrics = {
  previstos: number; produzidos: number; aprovados: number; publicados: number; pendentes: number; atrasados: number;
  cancelados: number; publicacoes: number; publicacoesFeitas: number; limite: number | null; cumprimento: number;
};
type Report = {
  titulo: string; month: string; recurring: boolean; cycle: { status: string; closedAt: string | null; note: string | null } | null;
  metrics: Metrics; porMarca: { brand: string; metrics: Metrics }[]; responsaveis: { name: string; total: number; pendentes: number }[];
  operacoes: { projectId: string; titulo: string; metrics: Metrics }[];
};
type History = { month: string; status: string; summary: Partial<Metrics> | null };

const BELEM = "America/Belem";
const thisMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }).slice(0, 7);
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const shift = (m: string, d: number) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7); };

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className="block h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] transition-[width] duration-500" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

const TILES: [keyof Metrics, string][] = [["previstos", "Previstos"], ["produzidos", "Produzidos"], ["aprovados", "Aprovados"], ["publicados", "Publicados"], ["pendentes", "Pendentes"], ["atrasados", "Atrasados"]];

/**
 * Indicadores do ciclo mensal (cada conteúdo conta uma vez, não importa em quantas redes sai).
 * `mode="admin"` fecha/reabre o mês; `mode="portal"` é o relatório do cliente (só leitura).
 */
export default function CycleCard({ projectId, mode }: { projectId: string; mode: "admin" | "portal" }) {
  const [month, setMonth] = useState(thisMonth);
  const [rep, setRep] = useState<Report | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const url = mode === "admin" ? `/api/admin/projects/${projectId}/cycle/?month=${month}` : `/api/portal/report/?projectId=${projectId}&month=${month}`;
  const load = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) { setRep(null); return; }
    const j = await r.json();
    setRep(j.report); setHistory(j.history ?? []);
  }, [url]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function act(action: "fechar" | "reabrir") {
    if (action === "fechar" && !confirm(`Fechar ${monthName(month)}? O projeto continua ativo; guardo o retrato dos números deste mês.`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/cycle/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, action }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Não consegui.");
      setMsg(action === "fechar" ? "Mês fechado." : "Mês reaberto."); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  if (!rep) return null;
  const m = rep.metrics;
  const meta = m.limite ? Math.max(m.limite, m.previstos) : m.previstos;
  const closed = rep.cycle?.status === "fechado";
  if (mode === "portal" && m.previstos === 0 && m.cancelados === 0 && !rep.operacoes.length) return null;

  return (
    <section className="kb-glass mt-4 grid gap-4 p-4" aria-label={`Ciclo de ${monthName(month)}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" className="kb-chip min-h-11 min-w-11" onClick={() => setMonth((x) => shift(x, -1))}>‹</button>
        <div className="min-w-0 text-center">
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{mode === "portal" ? "Relatório do mês" : rep.recurring ? "Ciclo mensal" : "Conteúdo do mês"}</p>
          <p className="font-display text-base capitalize">{monthName(month)}{closed && <span className="kb-tag ml-2 align-middle">fechado</span>}</p>
        </div>
        <button type="button" aria-label="Próximo mês" className="kb-chip min-h-11 min-w-11" onClick={() => setMonth((x) => shift(x, 1))}>›</button>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm">Cumprimento</span>
          <b className="tabular-nums">{m.cumprimento}%</b>
        </div>
        <div className="mt-2"><Bar value={m.publicados} max={meta} /></div>
        <p className="kb-faint mt-1.5 text-xs">{m.publicados} de {meta} conteúdo{meta === 1 ? "" : "s"} publicado{meta === 1 ? "" : "s"}{m.limite ? ` (plano: ${m.limite}/mês)` : ""} · {m.publicacoesFeitas} de {m.publicacoes} publicaç{m.publicacoes === 1 ? "ão" : "ões"} nas redes</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TILES.map(([k, label]) => (
          <div key={k} className="kb-card items-center !gap-0.5 !p-2 text-center">
            <b className={`text-lg tabular-nums ${k === "atrasados" && m.atrasados ? "text-[#ff9f5a]" : ""}`}>{m[k] as number}</b>
            <span className="kb-faint text-[11px]">{label}</span>
          </div>
        ))}
      </div>

      {rep.operacoes.length > 0 && (
        <div className="grid gap-2">
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Por operação</p>
          {rep.operacoes.map((o) => {
            const max = o.metrics.limite ? Math.max(o.metrics.limite, o.metrics.previstos) : o.metrics.previstos;
            return (
              <div key={o.projectId} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate">{o.titulo}</span><span className="kb-faint shrink-0 text-xs tabular-nums">{o.metrics.publicados}/{max} · {o.metrics.atrasados ? `${o.metrics.atrasados} atrasado${o.metrics.atrasados > 1 ? "s" : ""}` : "em dia"}</span></div>
                <Bar value={o.metrics.publicados} max={max} />
              </div>
            );
          })}
        </div>
      )}
      {rep.operacoes.length === 0 && rep.porMarca.length > 1 && (
        <div className="grid gap-2">
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Por marca</p>
          {rep.porMarca.map((b) => (
            <div key={b.brand} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm"><span>{b.brand}</span><span className="kb-faint text-xs tabular-nums">{b.metrics.publicados}/{b.metrics.previstos}</span></div>
              <Bar value={b.metrics.publicados} max={b.metrics.previstos} />
            </div>
          ))}
        </div>
      )}

      {mode === "admin" && rep.responsaveis.length > 0 && (
        <div>
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Responsáveis</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{rep.responsaveis.map((r) => <span key={r.name} className="kb-tag">{r.name} · {r.pendentes} pendente{r.pendentes === 1 ? "" : "s"}</span>)}</div>
        </div>
      )}

      {mode === "admin" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={closed ? "kb-btn-ghost min-h-11" : "kb-btn min-h-11"} disabled={busy} onClick={() => void act(closed ? "reabrir" : "fechar")}>{closed ? "Reabrir mês" : "Fechar mês"}</button>
          {history.filter((h) => h.status === "fechado" && h.month !== month).slice(-3).map((h) => (
            <button key={h.month} type="button" className="kb-chip min-h-11 capitalize" onClick={() => setMonth(h.month)}>{monthName(h.month).split(" ")[0]} · {h.summary?.cumprimento ?? 0}%</button>
          ))}
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </div>
      )}
    </section>
  );
}
