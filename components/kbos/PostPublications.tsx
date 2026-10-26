"use client";
import { useCallback, useEffect, useState } from "react";
import { NETWORKS, NETWORK_LABEL } from "@/lib/kbos/content-model";

type Pub = { network: string; status: string; url: string | null; error: string | null; publishedAt: string | null; scheduledAt: string | null; accountId?: string | null };
const PUB_LABEL: Record<string, string> = { pendente: "Pendente", agendado: "Agendado", publicado: "Publicado", erro: "Erro", cancelado: "Fora" };
const PUB_COLOR: Record<string, string> = { pendente: "#9a93a8", agendado: "#f472b6", publicado: "#22c55e", erro: "#ff5c5c", cancelado: "#5a5566" };

/** Editor do post (equipe): cada rede com o próprio status. O post só vira "postado" quando todas as redes ativas saem. */
export default function PostPublications({ postId, onPostStatus }: { postId: string; onPostStatus: (status: string) => void }) {
  const [items, setItems] = useState<Pub[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const base = `/api/admin/social/${postId}/publications/`;
  const load = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" }).catch(() => null);
    setItems(r?.ok ? (await r.json()).items ?? [] : []);
  }, [base]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function call(method: string, body: unknown) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(base, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
      setItems(j.items ?? []);
      if (j.postStatus) onPostStatus(j.postStatus);
      if (j.state?.partial) setMsg(`Publicado em ${j.state.published} de ${j.state.networks} redes.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  if (!items) return null;
  const active = items.filter((p) => p.status !== "cancelado").map((p) => p.network);
  const toggle = (n: string) => void call("PUT", { networks: active.includes(n) ? active.filter((x) => x !== n) : [...active, n] });

  return (
    <section className="space-y-2" aria-label="Redes">
      <p className="kb-faint text-[11px] uppercase tracking-[0.18em]">Redes · 1 conteúdo = 1 entrega</p>
      <div className="flex flex-wrap gap-1.5">
        {NETWORKS.slice(0, 6).map((n) => <button key={n} type="button" className="kb-chip min-h-10" aria-pressed={active.includes(n)} disabled={busy} onClick={() => toggle(n)}>{NETWORK_LABEL[n]}</button>)}
      </div>
      {items.filter((p) => p.status !== "cancelado").map((p) => (
        <div key={p.network} className="grid gap-1">
        <div className="kb-row gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm"><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: PUB_COLOR[p.status] }} />{NETWORK_LABEL[p.network] ?? p.network}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <input className="kb-control min-h-10 w-36 text-xs" inputMode="url" placeholder="link publicado" defaultValue={p.url ?? ""} aria-label={`Link no ${NETWORK_LABEL[p.network] ?? p.network}`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.url ?? "")) void call("PATCH", { network: p.network, url: v || null, ...(v && p.status !== "publicado" ? { status: "publicado" } : {}) }); }} />
            <select className="kb-control min-h-10 text-xs" value={p.status} disabled={busy} aria-label={`Status no ${NETWORK_LABEL[p.network] ?? p.network}`} onChange={(e) => void call("PATCH", { network: p.network, status: e.target.value })}>
              {["pendente", "agendado", "publicado", "erro"].map((s) => <option key={s} value={s}>{PUB_LABEL[s]}</option>)}
            </select>
          </span>
        </div>
        {p.status === "agendado" && p.scheduledAt && <p className="kb-faint pl-4 text-xs">{p.accountId ? "O KBOS publica" : "Agendado"} em {new Date(p.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Belem" })}</p>}
        {p.status === "erro" && p.error && <p className="pl-4 text-xs text-[#ff9f5a]">{p.error}</p>}
        {p.status === "publicado" && p.url && <a className="kb-faint pl-4 text-xs underline" href={p.url} target="_blank" rel="noopener noreferrer">Ver publicação ↗</a>}
        </div>
      ))}
      {msg && <p role="status" className="kb-faint text-xs">{msg}</p>}
    </section>
  );
}
