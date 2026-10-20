"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { id: string; title: string; brand: string | null; status: string; scheduledAt: string; daysLate: number; waitingClient: boolean; mine: boolean; people: string | null };
const STATUS: Record<string, string> = { roteiro: "Roteiro", captacao: "Captação", producao: "Em edição", aprovacao: "Aguardando aprovação", ajustes: "Ajustes", aprovado: "Aprovado", agendado: "Agendado", erro: "Erro ao postar" };
const when = (d: number) => (d <= 0 ? "venceu hoje" : d === 1 ? "1 dia de atraso" : `${d} dias de atraso`);

/** Aviso de posts atrasados. Some sozinho quando não há nenhum. */
export default function OverduePosts({ audience }: { audience: "admin" | "cliente" }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/posts/overdue", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (alive) setItems(d.items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (items.length === 0) return null;

  const client = audience === "cliente";
  const shown = items.slice(0, 6);
  return (
    <section aria-label="Posts atrasados" className="kb-glass flex flex-col gap-2 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display kb-ink text-base">{items.length === 1 ? "1 post atrasado" : `${items.length} posts atrasados`}</h2>
        {!client && <Link href="/admin/conteudo" className="kb-chip min-h-11">Abrir calendário</Link>}
      </div>
      <ul className="flex flex-col">
        {shown.map((p) => (
          <li key={p.id} className="kb-row">
            <span className="min-w-0">
              <span className="kb-ink block truncate text-[14px]">{p.title}</span>
              <span className="kb-faint block truncate text-[12px]">{[p.brand, STATUS[p.status] ?? p.status, p.people].filter(Boolean).join(" · ")}</span>
              {client && p.waitingClient && <span className="block text-[12px] text-[var(--kb-late)]">Falta a sua aprovação</span>}
            </span>
            <span className="kb-tag late shrink-0">{when(p.daysLate)}</span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && <p className="kb-faint text-xs">+{items.length - shown.length} no calendário.</p>}
    </section>
  );
}
