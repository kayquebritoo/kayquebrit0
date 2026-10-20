"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Msg = { id: string; body: string; createdAt: string; authorId: string; authorName: string; authorRole: string };
const hour = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Belem" });

export default function ProjectChat({ projectId, title, onClose }: { projectId: string; title: string; onClose: () => void }) {
  const [items, setItems] = useState<Msg[] | null>(null);
  const [me, setMe] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/chat`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui abrir a conversa.");
      setItems(d.items);
      setMe(d.me);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da conversa
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [items?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui enviar.");
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal flex max-h-[88dvh] flex-col gap-3" role="dialog" aria-label={`Conversa do projeto ${title}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Conversa do projeto</p>
            <h2 className="font-display kb-ink break-words text-lg">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        <div className="flex min-h-[220px] flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-3" aria-live="polite">
          {!items && !error && <div className="kb-skel h-16 w-full" />}
          {items?.length === 0 && <p className="kb-muted py-8 text-center text-sm">Ninguém falou ainda. Mande a primeira mensagem para a equipe.</p>}
          {items?.map((m) => {
            const mine = m.authorId === me;
            return (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-0.5 ${mine ? "self-end items-end" : "self-start items-start"}`}>
                <span className="kb-faint text-[11px]">{mine ? "Você" : m.authorName}{!mine && m.authorRole !== "cliente" ? " · equipe" : ""} · {hour(m.createdAt)}</span>
                <span className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-gradient-to-br from-[#4F12C7] to-[#350C85] text-[#EDE6EC]" : "bg-white/10 text-[#EDE6EC]"}`}>{m.body}</span>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <form onSubmit={send} className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={2} placeholder="Escreva sua mensagem…" aria-label="Mensagem" className="kb-control min-h-12 flex-1 resize-none" style={{ padding: "10px 14px" }} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(e); }} />
          <button type="submit" className="kb-btn min-h-12" disabled={sending || !text.trim()}>{sending ? "Enviando…" : "Enviar"}</button>
        </form>
      </div>
    </div>
  );
}
