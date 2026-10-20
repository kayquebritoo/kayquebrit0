"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLIENT_HUBS, lumeHref } from "@/lib/kbos/client-hubs";

type Post = {
  id: string; projectId: string | null; brand: string | null; title: string; format: string; scheduledAt: string | null;
  status: string; script: string | null; caption: string | null; mediaUrl: string | null; clientNote: string | null; copies: number; postedUrl: string | null;
};
type Project = { id: string; titulo: string };

const STATUS: { id: string; label: string }[] = [
  { id: "roteiro", label: "Roteiro" }, { id: "producao", label: "Em edição" }, { id: "aprovacao", label: "Aguardando cliente" },
  { id: "ajustes", label: "Ajustes" }, { id: "aprovado", label: "Aprovado" }, { id: "agendado", label: "Agendado" }, { id: "postado", label: "Postado" },
];
const FORMAT: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Flyer", story: "Story", outro: "Post" };
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Belem" });
const statusLabel = (s: string) => STATUS.find((x) => x.id === s)?.label ?? s;

export default function ContentBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Post | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/projects", { cache: "no-store" });
        const d = await r.json();
        const list: Project[] = (d.items || []).map((p: Project) => ({ id: p.id, titulo: p.titulo }));
        setProjects(list);
        setProjectId((cur) => cur || list[0]?.id || "");
      } catch { setError("Não consegui carregar os projetos."); }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ month });
      if (projectId) q.set("projectId", projectId);
      const r = await fetch(`/api/admin/social?${q}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui carregar o calendário.");
      setItems(d.items);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); }
  }, [month, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga do calendário ao trocar mês/projeto
    void load();
  }, [load]);

  const shown = useMemo(() => (items ?? []).filter((p) => filter === "all" || p.status === filter), [items, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const s of STATUS) c[s.id] = (items ?? []).filter((p) => p.status === s.id).length;
    return c;
  }, [items]);
  const days = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of shown) {
      const k = p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString("sv-SE", { timeZone: "America/Belem" }) : "sem-data";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [shown]);

  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
  }
  const monthName = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="kb-page mx-auto w-full max-w-4xl space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Projeto" className="kb-control min-h-11 max-w-full flex-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.length === 0 && <option value="">Sem projetos</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
        <button type="button" className="kb-btn min-h-11" disabled={!projectId} onClick={() => setImporting(true)}>Importar do mLabs</button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" className="kb-chip min-h-11 min-w-11" onClick={() => shift(-1)}>‹</button>
        <p className="font-display kb-ink text-lg capitalize">{monthName}</p>
        <button type="button" aria-label="Próximo mês" className="kb-chip min-h-11 min-w-11" onClick={() => shift(1)}>›</button>
      </div>

      <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
        {[{ id: "all", label: "Todos" }, ...STATUS].map((s) => (
          <button key={s.id} type="button" className="kb-chip" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.label}<span className="kb-faint tabular-nums">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
      {!items && !error && <div className="kb-skel h-40 w-full" />}
      {items && shown.length === 0 && <p className="kb-muted py-10 text-center text-sm">Nenhum post por aqui. Importe o calendário do mLabs ou troque o mês.</p>}

      {days.map(([k, list]) => (
        <section key={k} aria-label={k}>
          <h2 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">{k === "sem-data" ? "Sem data" : dayLabel(`${k}T12:00:00-03:00`)}</h2>
          {list.map((p) => (
            <button key={p.id} type="button" className="kb-row w-full text-left" onClick={() => setOpen(p)}>
              <span className="min-w-0">
                <span className="kb-ink block truncate text-[14px]">{p.title}</span>
                <span className="kb-faint block truncate text-[12px]">{[p.brand, FORMAT[p.format] ?? "Post", p.copies > 1 ? `${p.copies} redes` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`kb-tag shrink-0 ${p.status === "ajustes" ? "late" : ""}`}>{statusLabel(p.status)}</span>
            </button>
          ))}
        </section>
      ))}

      {open && <PostEditor post={open} onClose={() => setOpen(null)} onSaved={(p) => { setItems((cur) => (cur ?? []).map((x) => (x.id === p.id ? p : x))); setOpen(null); }} />}
      {importing && <ImportIcs projectId={projectId} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} />}
    </div>
  );
}

function PostEditor({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: (p: Post) => void }) {
  const [f, setF] = useState({ title: post.title, status: post.status, caption: post.caption ?? "", mediaUrl: post.mediaUrl ?? "", script: post.script ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hub = CLIENT_HUBS[0];
  const pasta = hub.empresas.find((e) => e.label === post.brand)?.pasta;

  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/admin/social/${post.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: f.title.trim() || post.title, status: f.status, caption: f.caption.trim() || null, mediaUrl: f.mediaUrl.trim() || null, script: f.script.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
      onSaved(d.item);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-3" role="dialog" aria-label="Editar post">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{[post.brand, FORMAT[post.format] ?? "Post", post.scheduledAt ? dayLabel(post.scheduledAt) : null].filter(Boolean).join(" · ")}</p>
            <h2 className="font-display kb-ink break-words text-lg">{post.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        {post.clientNote && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">Pedido do cliente: {post.clientNote}</p>}
        <label className="kb-field"><span>Título</span><input className="kb-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="kb-field"><span>Etapa</span>
          <select className="kb-control" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
        <label className="kb-field"><span>Link do arquivo para o cliente ver (Drive, Lume…)</span><input className="kb-control" inputMode="url" placeholder="https://…" value={f.mediaUrl} onChange={(e) => setF({ ...f, mediaUrl: e.target.value })} /></label>
        <label className="kb-field"><span>Legenda</span><textarea className="kb-control" style={{ padding: "10px 14px" }} rows={4} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></label>
        <label className="kb-field"><span>Roteiro</span><textarea className="kb-control" style={{ padding: "10px 14px" }} rows={8} value={f.script} onChange={(e) => setF({ ...f, script: e.target.value })} /></label>
        {f.status === "aprovacao" && post.status !== "aprovacao" && <p className="kb-faint text-xs">Ao salvar, o cliente recebe um aviso no WhatsApp com o link do portal.</p>}
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button>
          <a className="kb-btn-ghost min-h-12 inline-flex items-center" href={lumeHref(pasta ?? hub.pasta)}>Achar takes no Lume</a>
        </div>
      </div>
    </div>
  );
}

function ImportIcs({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [info, setInfo] = useState<{ total: number; fresh: number; existing: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const t = await file.text();
      const r = await fetch("/api/admin/social/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, text: t, dryRun: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui ler o arquivo.");
      setText(t); setInfo(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/social/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui importar.");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-3" role="dialog" aria-label="Importar calendário do mLabs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display kb-ink text-lg">Importar do mLabs</h2>
            <p className="kb-muted text-sm">Exporte o calendário (.ics) no mLabs e envie aqui. Itens com horário viram &quot;Agendado&quot;; sem horário, &quot;Roteiro&quot;. Reimportar não apaga nem desfaz nada.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <input ref={input} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {!info ? (
          <button type="button" className="kb-btn min-h-12 w-full" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Lendo…" : "Escolher arquivo .ics"}</button>
        ) : (
          <>
            <p className="kb-muted text-sm"><b className="kb-ink">{info.fresh}</b> posts novos · {info.existing} já existiam (de {info.total}).</p>
            <div className="flex gap-2">
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy || info.fresh === 0} onClick={() => void commit()}>{busy ? "Importando…" : `Importar ${info.fresh}`}</button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => { setInfo(null); setText(""); }}>Trocar arquivo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
