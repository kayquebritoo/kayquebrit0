"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; brand: string | null; status: string; scheduledAt: string; daysLate: number; waitingClient: boolean; mine: boolean; people: string | null };
// "postado" atrasado = saiu em parte das redes (a regra olha cada rede).
const STATUS: Record<string, string> = { roteiro: "Roteiro", captacao: "Captação", producao: "Em edição", aprovacao: "Aguardando aprovação", ajustes: "Ajustes", aprovado: "Aprovado", agendado: "Agendado", postado: "Falta publicar em alguma rede", erro: "Erro ao postar" };
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });
const when = (d: number) => (d <= 0 ? "venceu hoje" : d === 1 ? "1 dia de atraso" : `${d} dias de atraso`);

/** Aviso de posts atrasados do mês. O número é o mesmo do relatório do mês; some sozinho quando não há nenhum. */
export default function OverduePosts({ audience }: { audience: "admin" | "cliente" }) {
  const [data, setData] = useState<{ month: string; total: number; hidden: number; items: Item[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/posts/overdue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && typeof d.total === "number") setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!data || data.total === 0) return null;
  const { items, total, hidden } = data;

  const client = audience === "cliente";
  const shown = items.slice(0, 6);
  return (
    <section id="atrasados" aria-label="Posts atrasados" className="kb-glass scroll-mt-20 flex flex-col gap-2 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display kb-ink text-base">{total === 1 ? "1 post atrasado" : `${total} posts atrasados`} em {monthLabel(data.month)}</h2>
        {!client && <Link href="/admin/conteudo" className="kb-chip min-h-11">Abrir calendário</Link>}
      </div>
      <ul className="flex flex-col">
        {shown.map((p) => {
          const content = (
            <>
              <span className="min-w-0 flex-1">
                <span className="kb-ink block truncate text-[14px]">{p.title}</span>
                <span className="kb-faint block truncate text-[12px]">
                  {[p.brand, STATUS[p.status] ?? p.status, p.people].filter(Boolean).join(" · ")}
                </span>
                {client && p.waitingClient && (
                  <span className="block text-[12px] font-medium text-[var(--kb-late)]">
                    Falta a sua aprovação · Toque para revisar ↗
                  </span>
                )}
              </span>
              <span className="kb-tag late shrink-0">{when(p.daysLate)}</span>
            </>
          );
          return (
            <li key={p.id}>
              {client ? (
                <a
                  href="#calendario"
                  className="kb-row min-h-12 w-full text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none"
                >
                  {content}
                </a>
              ) : (
                <div className="kb-row">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > shown.length && <p className="kb-faint text-xs">+{items.length - shown.length} no calendário.</p>}
      {hidden > 0 && <p className="kb-faint text-xs">{hidden === 1 ? "1 ainda está" : `${hidden} ainda estão`} em produção com a equipe.</p>}
    </section>
  );
}
