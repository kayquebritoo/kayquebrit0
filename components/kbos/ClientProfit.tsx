"use client";
import { useEffect, useState } from "react";
import type { ClientProfit } from "@/lib/kbos/client-profit";

type Data = ClientProfit & { periodo: string; label: string };
const PERIODS = [
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
  { id: "12m", label: "12 meses" },
  { id: "ano", label: "Este ano" },
  { id: "ano-passado", label: "Ano passado" },
];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** "Quem me deu mais lucro?" — ranking de clientes por lucro no período (pago − custos dos projetos). */
export default function ClientProfitCard() {
  const [periodo, setPeriodo] = useState("12m");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mostra o carregando ao trocar de período.
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/reports/clients?periodo=${periodo}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha ao carregar.");
        if (alive) { setData(d); setError(""); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [periodo]);

  const rows = data?.rows ?? [];
  const shown = all ? rows : rows.slice(0, 8);
  const best = data?.best;
  const top = rows[0]?.profit || 1;

  return (
    <section className="kb-glass space-y-4 p-4 sm:p-5" aria-label="Lucro por cliente">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display kb-ink text-xl">Lucro por cliente</h2>
          <p className="kb-muted text-[12px]">Recebido menos os custos dos projetos de cada um. Só conta o que já foi pago.</p>
        </div>
        <div className="kb-scroll-x -mx-1 px-1">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className="kb-chip" aria-pressed={periodo === p.id} onClick={() => { setPeriodo(p.id); setAll(false); }}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="kb-tag late w-full justify-start rounded-2xl! px-4! py-3! text-sm">{error}</div>}

      {loading && !data ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="kb-skel h-14 rounded-2xl" />)}</div>
      ) : data && (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {best ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 p-4" style={{ background: "linear-gradient(135deg,#350C85 0%,#4F12C7 55%,rgba(232,14,253,.55) 100%)" }}>
              <p className="text-[11px] uppercase tracking-wider text-white/70">Cliente mais lucrativo · {data.label}</p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display truncate text-2xl text-white">{best.name}</p>
                  {best.company && best.company !== best.name && <p className="truncate text-sm text-white/70">{best.company}</p>}
                </div>
                <p className="font-display text-3xl text-white tabular-nums">{brl(best.profit)}</p>
              </div>
              <p className="mt-1 text-[12px] text-white/75">
                {pct(best.share)} do lucro total · margem {pct(best.margin)} · {best.payments} pagamento(s)
                {best.delta !== null ? ` · ${best.delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(best.delta * 100))}% vs período anterior` : ""}
              </p>
            </div>
          ) : (
            <p className="kb-muted py-6 text-center text-sm">Nenhum recebimento ligado a cliente neste período.</p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Lucro dos clientes", brl(data.totals.profit)],
              ["Recebido", brl(data.totals.income)],
              ["A receber", brl(data.totals.pending)],
              ["Sem cliente", brl(data.unassigned.income - data.unassigned.cost)],
            ].map(([k, v]) => (
              <div key={k} className="kb-stat">
                <span className="kb-muted text-[11px]">{k}</span>
                <span className="font-display kb-ink block text-lg tabular-nums">{v}</span>
              </div>
            ))}
          </div>
          {data.unassigned.count > 0 && (
            <p className="kb-faint mt-2 text-[12px]">{data.unassigned.count} lançamento(s) pago(s) sem cliente ou projeto não entraram no ranking. Ligue-os a um cliente no Financeiro para contarem.</p>
          )}

          <ol className="mt-3">
            {shown.map((r, i) => (
              <li key={r.contactId} className="kb-row flex-col items-stretch! gap-2 first:border-t-0">
                <div className="flex items-center gap-3">
                  <span className="kb-faint w-5 text-center text-[12px] tabular-nums">{i + 1}</span>
                  <span className="relative h-9 w-9 shrink-0">
                    <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--kb-accent-soft)] text-sm font-semibold uppercase">{r.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1) || "?"}</span>
                    {r.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/contacts/${r.contactId}/avatar`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-9 w-9 rounded-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="kb-ink block truncate text-[15px]">{r.name}{r.company && r.company !== r.name ? <span className="kb-muted"> · {r.company}</span> : null}</span>
                    <span className="kb-muted block text-[12px]">
                      recebeu {brl(r.income)}{r.cost ? ` · custo ${brl(r.cost)}` : ""} · margem {pct(r.margin)}{r.pending ? ` · a receber ${brl(r.pending)}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={`font-display block text-[15px] tabular-nums ${r.profit < 0 ? "text-[#FF6B6B]" : "kb-ink"}`}>{brl(r.profit)}</span>
                    {r.delta !== null && <span className={`text-[11px] ${r.delta >= 0 ? "text-[#4ADE80]" : "text-[#FF6B6B]"}`}>{r.delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(r.delta * 100))}%</span>}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, (Math.max(0, r.profit) / top) * 100))}%`, background: "linear-gradient(90deg,#4F12C7,#E80EFD)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
                </div>
              </li>
            ))}
          </ol>
          {rows.length > 8 && (
            <button type="button" className="kb-btn-ghost mt-2 w-full" onClick={() => setAll((v) => !v)}>{all ? "Mostrar só os 8 primeiros" : `Ver todos (${rows.length})`}</button>
          )}
        </div>
      )}
    </section>
  );
}
