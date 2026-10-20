"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_LIST, brandColor } from "@/lib/kbos/brand-colors";

type Post = { id: string; title: string; brand: string | null; format: string; scheduledAt: string | null; status: string; caption: string | null; mediaUrl: string | null; clientNote: string | null; script: string | null; mine: boolean };
type Proj = { id: string; titulo: string };
const FORMAT: Record<string, string> = { reels: "Vídeo (Reels)", carrossel: "Carrossel", estatico: "Post estático", story: "Story", outro: "Post" };
const LABEL: Record<string, string> = { roteiro: "Roteiro enviado", captacao: "Em produção", producao: "Em produção", aprovacao: "Aguardando você", ajustes: "Ajustes pedidos", aprovado: "Aprovado", agendado: "Agendado", postado: "Postado" };
const COLOR: Record<string, string> = { roteiro: "#9a93a8", captacao: "#4DA3FF", producao: "#8a6cf0", aprovacao: "#f5c46e", ajustes: "#ff9f5a", aprovado: "#3ecf8e", agendado: "#c08cff", postado: "#2fbf71" };
const BELEM = "America/Belem";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: BELEM });
const dayLong = (key: string) => new Date(`${key}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: BELEM });
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const BRANDS = BRAND_LIST;
type Quota = { limit: number | null; used: number; byFormat: Record<string, number> };

export default function PortalPosts() {
  const [items, setItems] = useState<Post[] | null>(null);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }).slice(0, 7));
  const [selected, setSelected] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }));
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/posts?month=${month}`, { cache: "no-store" });
      if (!r.ok) { setItems([]); return; }
      const d = await r.json();
      setItems(d.items || []);
      setProjects(d.projects || []);
      setQuota(d.quota ?? null);
    } catch { setItems([]); }
  }, [month]);
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

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of items ?? []) if (p.scheduledAt) m.set(dayKey(p.scheduledAt), [...(m.get(dayKey(p.scheduledAt)) ?? []), p]);
    return m;
  }, [items]);
  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const total = Math.ceil((first.getUTCDay() + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1, 1 - first.getUTCDay() + i));
      return { key: d.toISOString().slice(0, 10), n: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
    });
  }, [month]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: BELEM });
  const shift = (delta: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const monthName = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (!items) return null;
  if (items.length === 0 && projects.length === 0) return null;
  const waiting = items.filter((p) => p.status === "aprovacao");
  const dayPosts = byDay.get(selected) ?? [];

  return (
    <section className="kb-glass flex flex-col gap-4 p-5" aria-label="Calendário de posts">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Conteúdo das redes</p>
          <h2 className="font-display mt-1 text-xl">{waiting.length ? `${waiting.length} post${waiting.length > 1 ? "s" : ""} esperando sua aprovação` : "Calendário de posts"}</h2>
        </div>
        {projects.length > 0 && <button type="button" className="kb-btn min-h-11 shrink-0" onClick={() => setCreating(true)}>+ Roteiro</button>}
      </div>
      {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}

      {waiting.map((p) => (
        <article key={p.id} className="kb-card gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-xs">{[p.brand, FORMAT[p.format] ?? "Post", p.scheduledAt ? dayLong(dayKey(p.scheduledAt)) : null].filter(Boolean).join(" · ")}</p>
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

      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" className="kb-chip min-h-11 min-w-11" onClick={() => shift(-1)}>‹</button>
        <p className="font-display text-base capitalize">{monthName}</p>
        <button type="button" aria-label="Próximo mês" className="kb-chip min-h-11 min-w-11" onClick={() => shift(1)}>›</button>
      </div>
      {quota && (
        <div className="kb-card gap-2" aria-label="Posts do mês">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm">Posts de {monthName}</span>
            <b className="tabular-nums text-sm">{quota.limit === null ? quota.used : `${quota.used} de ${quota.limit}`}</b>
          </div>
          {quota.limit !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used}>
              <span className="block h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
            </div>
          )}
          <p className="kb-faint text-xs">{["carrossel", "estatico", "reels"].map((k) => `${quota.byFormat[k] ?? 0} ${k === "carrossel" ? "carrossel" : k === "estatico" ? "estático" : "vídeo"}`).join(" · ")}{quota.limit !== null && quota.used >= quota.limit ? " · limite do mês atingido" : ""}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Empresas">
        {BRANDS.map((b) => <span key={b} className="kb-faint inline-flex items-center gap-1.5 text-xs"><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: brandColor(b) ?? "#999" }} />{b}</span>)}
      </div>
      <div role="grid" aria-label={`Calendário de ${monthName}`}>
        <div className="grid grid-cols-7" role="row">{WEEK.map((w, i) => <div key={i} role="columnheader" className="kb-faint py-1 text-center text-[11px]">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((c) => {
            const list = byDay.get(c.key) ?? [];
            const sel = c.key === selected;
            return (
              <button key={c.key} type="button" role="gridcell" aria-selected={sel} aria-label={`${c.n}, ${list.length} post${list.length === 1 ? "" : "s"}`} onClick={() => setSelected(c.key)}
                className={`flex min-h-12 flex-col items-center gap-1 rounded-xl py-1 transition-colors ${c.inMonth ? "" : "opacity-35"} ${sel ? "bg-[var(--kb-chip-hover)]" : ""}`}>
                <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-[13px] tabular-nums ${c.key === today ? "bg-gradient-to-br from-[#4F12C7] to-[#E80EFD] font-semibold text-white" : ""}`}>{c.n}</span>
                <span className="flex gap-0.5">{list.slice(0, 4).map((p) => <i key={p.id} aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: brandColor(p.brand) ?? COLOR[p.status] ?? "#9a93a8" }} />)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">{dayLong(selected)}</h3>
        {dayPosts.length === 0 ? <p className="kb-muted py-4 text-center text-sm">Nada marcado para esse dia.</p> : dayPosts.filter((p) => p.status !== "aprovacao").map((p) => (
          <div key={p.id} className="kb-row">
            <span className="min-w-0">
              <span className="block truncate text-sm">{p.title}</span>
              <span className="kb-faint flex items-center gap-1.5 truncate text-xs">{brandColor(p.brand) && <i aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: brandColor(p.brand) ?? undefined }} />}{[p.brand, FORMAT[p.format] ?? "Post"].filter(Boolean).join(" · ")}</span>
              {p.mine && p.script && <span className="kb-muted block whitespace-pre-wrap break-words pt-1 text-xs">{p.script}</span>}
            </span>
            <span className={`kb-tag shrink-0 gap-1.5 ${p.status === "ajustes" ? "late" : ""}`}><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[p.status] ?? "#9a93a8" }} />{LABEL[p.status] ?? p.status}</span>
          </div>
        ))}
        {projects.length > 0 && <button type="button" className="kb-btn-ghost mt-2 min-h-11 w-full" onClick={() => setCreating(true)}>+ Cadastrar roteiro neste dia</button>}
      </div>

      {creating && <NewRoteiro projects={projects} date={selected} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(); }} />}
    </section>
  );
}

function NewRoteiro({ projects, date, onClose, onDone }: { projects: Proj[]; date: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ projectId: projects[0]?.id ?? "", date, brand: "", format: "reels", title: "", script: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/portal/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, brand: f.brand || null, script: f.script || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-3" role="dialog" aria-label="Novo roteiro">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg">Novo roteiro</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        {projects.length > 1 && <label className="kb-field"><span>Projeto</span><select className="kb-control min-h-12" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}</select></label>}
        <div className="grid grid-cols-2 gap-2">
          <label className="kb-field"><span>Dia</span><input className="kb-control min-h-12 text-base" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="kb-field"><span>Formato</span><select className="kb-control min-h-12" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label className="kb-field"><span>Marca</span><select className="kb-control min-h-12" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}><option value="">—</option>{BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <label className="kb-field"><span>Título</span><input className="kb-control min-h-12 text-base" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Camarão na chapa" /></label>
        <label className="kb-field"><span>Roteiro / ideia</span><textarea className="kb-control text-base" style={{ padding: "10px 14px" }} rows={6} value={f.script} onChange={(e) => setF({ ...f, script: e.target.value })} /></label>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <button type="button" className="kb-btn min-h-12 w-full" disabled={busy || f.title.trim().length < 2 || !f.date} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar roteiro"}</button>
      </div>
    </div>
  );
}
