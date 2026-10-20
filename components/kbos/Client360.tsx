"use client";
import Link from "next/link";
import ClientHubLinks from "@/components/kbos/ClientHubLinks";
import { useEffect, useState } from "react";
import type { Summary, TimelineEvent, Kind } from "@/lib/kbos/client360";
import { FRONT_LABEL, type Front } from "@/lib/kbos/fronts";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const KIND_LABEL: Record<Kind, string> = {
  negocio: "Negócio", orcamento: "Orçamento", projeto: "Projeto", cobranca: "Cobrança",
  pagamento: "Pagamento", tarefa: "Tarefa", conversa: "Conversa", case: "Portfólio",
};

type Person = { id: string; name: string; company: string | null; phone: string | null; email: string | null; status: string };
type Data = { contact: Person; summary: Summary; timeline: TimelineEvent[] };

export default function Client360({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/contacts/${id}/360`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Não consegui abrir a ficha.");
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const s = data?.summary;
  const tiles = s
    ? [
        { label: "Recebido", value: brl(s.received) },
        { label: "A receber", value: brl(s.open), tone: "" },
        { label: "Em atraso", value: brl(s.overdue), tone: s.overdue > 0 ? "late" : "" },
        { label: "Projetos ativos", value: String(s.activeProjects) },
        { label: "Propostas abertas", value: s.openBudgets ? `${s.openBudgets} · ${brl(s.openBudgetsValue)}` : "0" },
      ]
    : [];
  const fronts = s ? (Object.entries(s.byFront) as [Front, number][]).filter(([, v]) => v > 0) : [];

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" role="dialog" aria-label="Ficha do cliente">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display kb-ink truncate text-xl">{data?.contact.name ?? "Ficha do cliente"}</h2>
            {data?.contact.company && data.contact.company !== data.contact.name && <p className="kb-muted truncate text-sm">{data.contact.company}</p>}
            {s?.firstContact && <p className="kb-faint text-[12px]">Cliente desde {day(s.firstContact)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 shrink-0 text-2xl">×</button>
        </div>

        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}

        {!data && !error && <div className="kb-skel h-24 w-full" />}

        {data && (
          <>
            <div className="flex flex-wrap gap-2">
              {data.contact.phone && <a className="kb-chip" href={`https://wa.me/${data.contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              {data.contact.email && <a className="kb-chip" href={`mailto:${data.contact.email}`}>E-mail</a>}
              <button type="button" className="kb-chip" onClick={onEdit}>Editar cadastro</button>
            </div>

            <ClientHubLinks name={data.contact.name} company={data.contact.company} />

            <section aria-label="Resumo" className="kb-stat-grid">
              {tiles.map((t) => (
                <div key={t.label} className="kb-stat">
                  <b className={t.tone === "late" ? "text-[var(--kb-late)]" : ""}>{t.value}</b>
                  <small>{t.label}</small>
                </div>
              ))}
            </section>

            {fronts.length > 0 && (
              <p className="kb-muted text-sm">
                Frentes contratadas:{" "}
                {fronts.map(([f, v], i) => (
                  <span key={f}>{i > 0 && " · "}<b className="kb-ink">{FRONT_LABEL[f]}</b> {brl(v)}</span>
                ))}
              </p>
            )}

            <section aria-label="Linha do tempo">
              <h3 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">Linha do tempo</h3>
              {data.timeline.length === 0 && <p className="kb-muted py-6 text-center text-sm">Ainda não há nada com essa pessoa.</p>}
              {data.timeline.map((e) => {
                const inner = (
                  <>
                    <span className="min-w-0">
                      <span className="kb-ink block truncate text-[14px]">{e.title}</span>
                      <span className="kb-faint block truncate text-[12px]">
                        {KIND_LABEL[e.kind]} · {day(e.at)}{e.detail ? ` · ${e.detail}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {e.amount != null && <span className="kb-ink tabular-nums text-[13px]">{brl(e.amount)}</span>}
                      {e.tone === "late" && <span className="kb-tag late">Atrasado</span>}
                    </span>
                  </>
                );
                return e.href ? (
                  <Link key={e.id} href={e.href} className="kb-row w-full text-left">{inner}</Link>
                ) : (
                  <div key={e.id} className="kb-row">{inner}</div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
