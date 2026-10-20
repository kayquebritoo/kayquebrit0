"use client";
import { useCallback, useEffect, useState } from "react";

type Post = { id: string; title: string; brand: string | null; format: string; scheduledAt: string | null; status: string; caption: string | null; mediaUrl: string | null; clientNote: string | null };
const FORMAT: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Flyer", story: "Story", outro: "Post" };
const LABEL: Record<string, string> = { aprovacao: "Aguardando você", ajustes: "Ajustes pedidos", aprovado: "Aprovado", agendado: "Agendado", postado: "Postado" };
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long", timeZone: "America/Belem" });

export default function PortalPosts() {
  const [items, setItems] = useState<Post[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/portal/posts", { cache: "no-store" });
      if (!r.ok) { setItems([]); return; }
      setItems((await r.json()).items || []);
    } catch { setItems([]); }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos posts
    void load();
  }, [load]);

  async function decide(id: string, decision: "aprovar" | "ajustes") {
    setBusy(id); setError("");
    try {
      const r = await fetch(`/api/portal/posts/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: decision === "ajustes" ? note : null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui enviar.");
      setAsking(null); setNote("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(null); }
  }

  if (!items || items.length === 0) return null;
  const waiting = items.filter((p) => p.status === "aprovacao");
  const rest = items.filter((p) => p.status !== "aprovacao").slice(0, 12);

  return (
    <section className="kb-glass flex flex-col gap-4 p-5" aria-label="Posts para aprovar">
      <div>
        <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Conteúdo das redes</p>
        <h2 className="font-display mt-1 text-xl">{waiting.length ? `${waiting.length} post${waiting.length > 1 ? "s" : ""} esperando sua aprovação` : "Calendário de posts"}</h2>
      </div>
      {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
      {waiting.map((p) => (
        <article key={p.id} className="kb-card gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-xs">{[p.brand, FORMAT[p.format] ?? "Post", p.scheduledAt ? day(p.scheduledAt) : null].filter(Boolean).join(" · ")}</p>
            <h3 className="break-words text-base font-medium">{p.title}</h3>
            {p.caption && <p className="kb-muted mt-2 whitespace-pre-wrap break-words text-sm">{p.caption}</p>}
          </div>
          {p.mediaUrl && <a href={p.mediaUrl} target="_blank" rel="noopener noreferrer" className="kb-btn-ghost min-h-11 inline-flex items-center self-start">Ver arte / vídeo ↗</a>}
          {asking === p.id ? (
            <div className="flex flex-col gap-2">
              <textarea className="kb-control" style={{ padding: "10px 14px" }} rows={3} maxLength={1000} placeholder="O que precisa mudar?" aria-label="O que precisa mudar" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className="kb-btn min-h-11 flex-1" disabled={busy === p.id || !note.trim()} onClick={() => void decide(p.id, "ajustes")}>Enviar pedido</button>
                <button type="button" className="kb-btn-ghost min-h-11" onClick={() => { setAsking(null); setNote(""); }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy === p.id} onClick={() => void decide(p.id, "aprovar")}>{busy === p.id ? "Enviando…" : "Aprovar"}</button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => setAsking(p.id)}>Pedir ajustes</button>
            </div>
          )}
        </article>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-col">
          {rest.map((p) => (
            <div key={p.id} className="kb-row">
              <span className="min-w-0">
                <span className="block truncate text-sm">{p.title}</span>
                <span className="kb-faint block truncate text-xs">{[FORMAT[p.format] ?? "Post", p.scheduledAt ? day(p.scheduledAt) : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`kb-tag shrink-0 ${p.status === "ajustes" ? "late" : ""}`}>{LABEL[p.status] ?? p.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
