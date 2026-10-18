"use client";
import { useEffect, useState } from "react";
import { FRONT_LABEL } from "@/lib/kbos/fronts";
import type { Forecast, MeiStatus, MonthResult, ProjectProfit } from "@/lib/kbos/reports";

type Data = { month: string; scope: string; result: MonthResult; profit: ProjectProfit[]; forecast: Forecast[]; mei: MeiStatus };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const SCOPES = [{ id: "empresa", label: "Empresa" }, { id: "pessoal", label: "Pessoal" }, { id: "tudo", label: "Tudo" }];

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Relatorios() {
  const [scope, setScope] = useState("empresa");
  const [month, setMonth] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = new URLSearchParams({ scope });
        if (month) q.set("month", month);
        const res = await fetch(`/api/admin/reports?${q}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha ao carregar.");
        if (!alive) return;
        setData(d);
        setError("");
        if (!month) setMonth(d.month);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => { alive = false; };
  }, [scope, month]);

  const r = data?.result;
  const mei = data?.mei;
  const meiTone = mei && (mei.level === "ok" ? "" : mei.level === "atencao" ? "soon" : "late");

  return (
    <div className="space-y-4">
      {error && <div className="kb-tag late w-full justify-start rounded-2xl! px-4! py-3! text-sm">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="kb-seg w-full sm:w-auto sm:min-w-[280px]" role="group" aria-label="Carteira">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</button>
          ))}
        </div>
        {month && (
          <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
            <button type="button" className="kb-muted h-11 w-11 text-xl" aria-label="Mês anterior" onClick={() => setMonth(shift(month, -1))}>‹</button>
            <span className="kb-ink min-w-36 text-center text-sm">{monthName(month).replace(/^./, (c) => c.toUpperCase()).replace(" De ", " de ")}</span>
            <button type="button" className="kb-muted h-11 w-11 text-xl" aria-label="Próximo mês" onClick={() => setMonth(shift(month, 1))}>›</button>
          </div>
        )}
      </div>

      <section aria-label="Resultado do mês" className="kb-stat-grid">
        {r ? (
          <>
            <div className="kb-stat"><b>{brl(r.income)}</b><small>Entrou</small></div>
            <div className="kb-stat"><b>{brl(r.expense)}</b><small>Saiu</small></div>
            <div className="kb-stat"><b className={r.result < 0 ? "text-[var(--kb-late)]" : ""}>{brl(r.result)}</b><small>Resultado</small></div>
            <div className="kb-stat"><b>{brl(r.pendingIncome - r.pendingExpense)}</b><small>Ainda pendente</small></div>
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <div key={i} className="kb-stat"><span className="kb-skel h-[27px] w-20" /></div>)
        )}
      </section>

      {mei && scope !== "pessoal" && (
        <section className="kb-glass space-y-3 p-5" aria-label="Teto do MEI">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Teto do MEI em {mei.year}</h2>
            <span className={`kb-tag ${meiTone}`}>{Math.round(mei.pct * 100)}% usado</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(mei.pct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" style={{ width: `${Math.min(100, mei.pct * 100)}%` }} />
          </div>
          <p className="kb-muted text-sm">
            {brl(mei.revenue)} de {brl(mei.limit)} · restam {brl(mei.remaining)}
            {mei.monthlyAverageLeft != null && mei.remaining > 0 ? ` (≈ ${brl(mei.monthlyAverageLeft)} por mês até dezembro)` : ""}. No ritmo atual: {brl(mei.projected)} no ano.
          </p>
          <p className="kb-ink text-sm">{mei.message}</p>
          <p className="kb-faint text-[12px]">Conta as entradas pagas da empresa, pela data de vencimento. Confira com seu contador; o teto muda se abrir o CNPJ no meio do ano.</p>
        </section>
      )}

      <section className="kb-glass space-y-3 p-5" aria-label="Previsão de caixa">
        <h2 className="text-base font-semibold">Previsão de caixa</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(data?.forecast ?? []).map((f) => (
            <div key={f.days} className="kb-stat">
              <small>Próximos {f.days} dias</small>
              <b className={f.net < 0 ? "text-[var(--kb-late)]" : ""}>{brl(f.net)}</b>
              <small>+{brl(f.income)} · −{brl(f.expense)}</small>
            </div>
          ))}
        </div>
        {data && data.forecast[0].late > 0 && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">Mais {brl(data.forecast[0].late)} de clientes já vencidos e não pagos. Fora da previsão.</p>}
      </section>

      <section className="kb-glass space-y-1 p-5" aria-label="Por categoria e frente">
        <h2 className="mb-2 text-base font-semibold">De onde vem e pra onde vai</h2>
        {r && Object.keys(r.byFront).length > 0 && (
          <p className="kb-muted pb-2 text-sm">
            Receita por frente:{" "}
            {(Object.entries(r.byFront) as [keyof typeof FRONT_LABEL, number][]).map(([f, v], i) => (
              <span key={f}>{i > 0 && " · "}<b className="kb-ink">{FRONT_LABEL[f]}</b> {brl(v)}</span>
            ))}
          </p>
        )}
        {r?.byCategory.map((c) => (
          <div key={`${c.tipo}-${c.categoria}`} className="kb-row">
            <span className="kb-ink text-[14px]">{c.categoria} <span className="kb-faint text-[12px]">{c.tipo === "entrada" ? "entrada" : "saída"}</span></span>
            <span className="tabular-nums text-[14px]">{brl(c.total)}</span>
          </div>
        ))}
        {r && r.byCategory.length === 0 && <p className="kb-muted py-6 text-center text-sm">Nada pago neste mês.</p>}
      </section>

      <section className="kb-glass space-y-1 p-5" aria-label="Lucro por projeto">
        <h2 className="text-base font-semibold">Lucro por projeto</h2>
        <p className="kb-faint pb-2 text-[12px]">Recebido menos custos ligados ao projeto. O valor por hora aparece quando há tempo registrado.</p>
        {data?.profit.map((p) => (
          <div key={p.id} className="kb-row">
            <span className="min-w-0">
              <span className="kb-ink block truncate text-[14px]">{p.titulo}</span>
              <span className="kb-faint text-[12px]">{[p.front && FRONT_LABEL[p.front], p.hours > 0 && `${p.hours.toFixed(1)} h`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="tabular-nums text-[14px]">{brl(p.net)}</span>
              {p.perHour != null && <span className="kb-faint text-[12px]">{brl(p.perHour)}/h</span>}
            </span>
          </div>
        ))}
        {data && data.profit.length === 0 && <p className="kb-muted py-6 text-center text-sm">Ligue lançamentos a projetos para ver o lucro de cada um.</p>}
      </section>
    </div>
  );
}
