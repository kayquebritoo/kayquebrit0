"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND_LIST, brandColor } from "@/lib/kbos/brand-colors";
import { NETWORKS, NETWORK_LABEL } from "@/lib/kbos/content-model";

type Take = { id: number; nome: string; t: number | null; by: string | null; at: string };
type Post = {
  id: string; projectId: string | null; title: string; brand: string | null; format: string; networks: string[]; scheduledAt: string | null; status: string;
  caption: string | null; mediaUrl: string | null; clientNote: string | null; script: string | null; mine: boolean; manage: boolean; takes: Take[];
  people: { scriptBy: string | null; captureBy: string | null; editor: string | null } | null; postedUrl: string | null;
};
type Proj = { id: string; titulo: string; manage?: boolean; parentId?: string | null };
type Pool = { rootId: string; titulo: string; limit: number | null; used: number; manage: boolean; ops: { id: string; titulo: string; limit: number | null; used: number }[] };
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Empresa de uma operação pelo título ("Hotel Atalaia VIP" → Hotel). */
const brandOf = (titulo: string) => BRAND_LIST.find((b) => plain(titulo).includes(plain(b))) ?? null;
const FORMAT: Record<string, string> = { reels: "Vídeo (Reels)", carrossel: "Carrossel", estatico: "Post estático", story: "Story", outro: "Post" };
const LABEL: Record<string, string> = { roteiro: "Planejado", captacao: "Em captação", producao: "Em edição", aprovacao: "Aguardando você", ajustes: "Ajustes pedidos", aprovado: "Aprovado", agendado: "Agendado", postado: "Publicado", erro: "Agendado", cancelado: "Cancelado" };
const COLOR: Record<string, string> = { roteiro: "#9a93a8", captacao: "#4DA3FF", producao: "#8a6cf0", aprovacao: "#f5c46e", ajustes: "#ff9f5a", aprovado: "#3ecf8e", agendado: "#c08cff", postado: "#2fbf71", erro: "#c08cff", cancelado: "#5a5566" };
const BELEM = "America/Belem";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: BELEM });
const dayLong = (key: string) => new Date(`${key}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: BELEM });
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const BRANDS = BRAND_LIST;
const mmss = (t: number | null) => (t === null ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
type Quota = { limit: number | null; used: number; byFormat: Record<string, number> };

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
  return d;
}

/** Calendário de conteúdo do portal. Quem faz a gestão (gerente de marketing) planeja, roteiriza, edita e escolhe os takes. */
export default function PortalPosts() {
  const [items, setItems] = useState<Post[] | null>(null);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }).slice(0, 7));
  const [selected, setSelected] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }));
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [picking, setPicking] = useState<Post | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [brand, setBrand] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/posts?month=${month}`, { cache: "no-store" });
      if (!r.ok) { setItems([]); return; }
      const d = await r.json();
      setItems(d.items || []);
      setProjects(d.projects || []);
      setQuota(d.quota ?? null);
      setPools(d.pools ?? []);
    } catch { setItems([]); }
  }, [month]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos posts
    void load();
  }, [load]);

  async function decide(id: string, decision: "aprovar" | "ajustes") {
    setBusy(id); setError("");
    try {
      await send(`/api/portal/posts/${id}`, "POST", { decision, note: decision === "ajustes" ? note : null });
      setAsking(null); setNote("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(null); }
  }

  const shown = useMemo(() => (items ?? []).filter((p) => !brand || p.brand === brand), [items, brand]);
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of shown) if (p.scheduledAt) m.set(dayKey(p.scheduledAt), [...(m.get(dayKey(p.scheduledAt)) ?? []), p]);
    return m;
  }, [shown]);
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
  const manager = projects.some((p) => p.manage);
  const waiting = shown.filter((p) => p.status === "aprovacao");
  const dayPosts = byDay.get(selected) ?? [];
  const planned = shown.filter((p) => p.status === "roteiro" && p.scheduledAt && dayKey(p.scheduledAt).startsWith(month)).length;
  const canEdit = (p: Post) => p.status !== "postado" && (p.manage || (p.mine && p.status === "roteiro"));

  return (
    <section className="kb-glass flex flex-col gap-4 p-5" aria-label="Calendário de conteúdo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{manager ? "Calendário editorial · gestão" : "Conteúdo das redes"}</p>
          <h2 className="font-display mt-1 text-xl">{waiting.length ? `${waiting.length} post${waiting.length > 1 ? "s" : ""} esperando sua aprovação` : manager ? "Planeje o mês" : "Calendário de posts"}</h2>
          {manager && planned > 0 && <p className="kb-muted mt-1 text-sm">{planned} conteúdo{planned > 1 ? "s" : ""} planejado{planned > 1 ? "s" : ""} aguardando a equipe começar.</p>}
        </div>
        {projects.length > 0 && <button type="button" className="kb-btn min-h-11 shrink-0" onClick={() => setEditing("new")}>+ {manager ? "Conteúdo" : "Roteiro"}</button>}
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
      {pools.map((pl) => <PoolCard key={pl.rootId} pool={pl} monthName={monthName} onChanged={() => void load()} />)}
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
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por empresa">
        <button type="button" className="kb-chip min-h-9" aria-pressed={brand === ""} onClick={() => setBrand("")}>Todas</button>
        {BRANDS.map((b) => <button key={b} type="button" className="kb-chip min-h-9 gap-1.5" aria-pressed={brand === b} onClick={() => setBrand(brand === b ? "" : b)}><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: brandColor(b) ?? "#999" }} />{b}</button>)}
      </div>
      <div role="grid" aria-label={`Calendário de ${monthName}`}>
        <div className="grid grid-cols-7" role="row">{WEEK.map((w, i) => <div key={i} role="columnheader" className="kb-faint py-1 text-center text-[11px]">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((c) => {
            const list = (byDay.get(c.key) ?? []).filter((p) => p.status !== "cancelado");
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
        {dayPosts.length === 0 ? <p className="kb-muted py-4 text-center text-sm">Nada marcado para esse dia.</p> : dayPosts.filter((p) => p.status !== "aprovacao").map((p) => {
          const body = (
            <>
              <span className="min-w-0">
                <span className={`block truncate text-sm ${p.status === "cancelado" ? "line-through" : ""}`}>{p.title}</span>
                <span className="kb-faint flex items-center gap-1.5 truncate text-xs">{brandColor(p.brand) && <i aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: brandColor(p.brand) ?? undefined }} />}{[p.brand, FORMAT[p.format] ?? "Post", p.networks?.length ? p.networks.map((n) => NETWORK_LABEL[n] ?? n).join(", ") : null, p.takes?.length ? `${p.takes.length} take${p.takes.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</span>
                {p.manage && p.people && <span className="kb-faint block truncate text-[11px]">{[p.people.scriptBy && `Roteiro: ${p.people.scriptBy}`, p.people.captureBy && `Capta: ${p.people.captureBy}`, p.people.editor && `Edita: ${p.people.editor}`].filter(Boolean).join(" · ")}</span>}
              </span>
              <span className={`kb-tag shrink-0 gap-1.5 ${p.status === "ajustes" ? "late" : ""}`}><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[p.status] ?? "#9a93a8" }} />{LABEL[p.status] ?? p.status}</span>
            </>
          );
          const cls = `kb-row w-full text-left ${p.status === "cancelado" ? "opacity-50" : ""}`;
          return canEdit(p)
            ? <button key={p.id} type="button" className={cls} onClick={() => setEditing(p)}>{body}</button>
            : <div key={p.id} className={cls}>{body}</div>;
        })}
        {projects.length > 0 && <button type="button" className="kb-btn-ghost mt-2 min-h-11 w-full" onClick={() => setEditing("new")}>+ {manager ? "Planejar conteúdo" : "Cadastrar roteiro"} neste dia</button>}
      </div>

      {editing && (
        <ContentEditor
          post={editing === "new" ? null : editing} projects={projects} date={selected}
          onClose={() => setEditing(null)}
          onPickTakes={(p) => { setEditing(null); setPicking(p); }}
          onDone={() => { setEditing(null); void load(); }}
        />
      )}
      {picking && <TakesPicker post={picking} onClose={() => { setPicking(null); void load(); }} onDone={() => { setPicking(null); void load(); }} />}
    </section>
  );
}

function ContentEditor({ post, projects, date, onClose, onDone, onPickTakes }: { post: Post | null; projects: Proj[]; date: string; onClose: () => void; onDone: () => void; onPickTakes: (p: Post) => void }) {
  // com operações (Hotel, Lounge, Praça), o conteúdo nasce na operação; o principal fica para o que é de todas
  const ops = projects.filter((p) => p.parentId);
  const firstManaged = ops.find((p) => p.manage) ?? projects.find((p) => p.manage) ?? projects[0];
  const [f, setF] = useState(() => ({
    projectId: post?.projectId ?? firstManaged?.id ?? "", date: post?.scheduledAt ? dayKey(post.scheduledAt) : date, brand: post?.brand ?? (firstManaged ? brandOf(firstManaged.titulo) ?? "" : ""), format: post?.format ?? "reels",
    title: post?.title ?? "", script: post?.script ?? "", caption: post?.caption ?? "", networks: post?.networks?.length ? post.networks : ["instagram"],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const manage = post ? post.manage : !!projects.find((p) => p.id === f.projectId)?.manage;
  const toggle = (n: string) => setF((x) => ({ ...x, networks: x.networks.includes(n) ? x.networks.filter((y) => y !== n) : [...x.networks, n] }));

  async function save(then?: (p: Post) => void) {
    setBusy(true); setError("");
    try {
      const common = { title: f.title, brand: f.brand || null, format: f.format, script: f.script || null, ...(manage ? { caption: f.caption || null, networks: f.networks } : {}) };
      let id = post?.id ?? "";
      if (post) await send(`/api/portal/posts/${post.id}`, "PATCH", { ...common, date: f.date });
      else id = (await send("/api/portal/posts", "POST", { ...common, projectId: f.projectId, date: f.date })).id;
      if (then) then({ ...(post ?? { status: "roteiro", mine: true, manage, takes: [], networks: f.networks }), id, projectId: f.projectId, title: f.title, brand: f.brand || null, format: f.format } as Post);
      else onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function setStatus(status: "cancelado" | "roteiro") {
    if (!post) return;
    if (status === "cancelado" && !confirm(`Cancelar "${post.title}"? Ele sai da contagem do mês (dá para reativar depois).`)) return;
    setBusy(true); setError("");
    try { await send(`/api/portal/posts/${post.id}`, "PATCH", { status }); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); setBusy(false); }
  }

  const status = post?.status;
  const ready = f.title.trim().length >= 2 && !!f.date && !!f.projectId;
  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-3" role="dialog" aria-label={post ? "Editar conteúdo" : "Novo conteúdo"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">{post ? "Conteúdo" : manage ? "Novo conteúdo" : "Novo roteiro"}</h2>
            {status && <p className="kb-faint text-xs">{LABEL[status] ?? status}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        {!post && projects.length > 1 && <label className="kb-field"><span>{ops.length ? "Empresa / operação" : "Projeto"}</span><select className="kb-control min-h-12" value={f.projectId} onChange={(e) => { const pr = projects.find((p) => p.id === e.target.value); setF({ ...f, projectId: e.target.value, brand: (pr && brandOf(pr.titulo)) || f.brand }); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.parentId ? p.titulo : ops.length ? `${p.titulo} (todas)` : p.titulo}</option>)}</select></label>}
        <div className="grid grid-cols-2 gap-2">
          <label className="kb-field"><span>Dia</span><input className="kb-control min-h-12 text-base" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="kb-field"><span>Formato</span><select className="kb-control min-h-12" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label className="kb-field"><span>Empresa</span><select className="kb-control min-h-12" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}><option value="">—</option>{BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <label className="kb-field"><span>Título</span><input className="kb-control min-h-12 text-base" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Camarão na chapa" /></label>
        {manage && (
          <div className="kb-field"><span>Redes</span>
            <div className="flex flex-wrap gap-1.5">{NETWORKS.slice(0, 5).map((n) => <button key={n} type="button" className="kb-chip min-h-10" aria-pressed={f.networks.includes(n)} onClick={() => toggle(n)}>{NETWORK_LABEL[n]}</button>)}</div>
            <span className="kb-faint text-xs">Um conteúdo em várias redes conta como uma entrega.</span>
          </div>
        )}
        <label className="kb-field"><span>Roteiro / ideia</span><textarea className="kb-control text-base" style={{ padding: "10px 14px" }} rows={6} value={f.script} onChange={(e) => setF({ ...f, script: e.target.value })} /></label>
        {manage && <label className="kb-field"><span>Legenda</span><textarea className="kb-control text-base" style={{ padding: "10px 14px" }} rows={4} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></label>}
        {post && (post.takes?.length ?? 0) > 0 && (
          <div className="kb-field"><span>Takes escolhidos</span>
            <div className="flex flex-wrap gap-1.5">{post.takes.map((t) => <span key={t.id} className="kb-tag">{t.nome}{t.t !== null ? ` · ${mmss(t.t)}` : ""}</span>)}</div>
          </div>
        )}
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        {status === "cancelado" ? (
          <button type="button" className="kb-btn min-h-12 w-full" disabled={busy} onClick={() => void setStatus("roteiro")}>Reativar como planejado</button>
        ) : (
          <>
            <button type="button" className="kb-btn min-h-12 w-full" disabled={busy || !ready} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="kb-btn-ghost min-h-12 w-full" disabled={busy || !ready} onClick={() => void save(onPickTakes)}>{post?.takes?.length ? "Trocar takes no Lume" : "Salvar e escolher takes no Lume"}</button>
            {post && manage && <button type="button" className="kb-chip min-h-11 w-full justify-center text-rose-300" disabled={busy} onClick={() => void setStatus("cancelado")}>Cancelar conteúdo</button>}
          </>
        )}
      </div>
    </div>
  );
}

type Found = { id: number; nome: string; tipo: string; segundo: number | null; data: string | null; thumb: string };

/** Busca no acervo do Lume da empresa e marca os takes do conteúdo. */
function TakesPicker({ post, onClose, onDone }: { post: Post; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"video" | "foto" | "">(post.format === "reels" || post.format === "story" ? "video" : "");
  const [sub, setSub] = useState(post.brand ?? "");
  const [found, setFound] = useState<Found[] | null>(null);
  const [chosen, setChosen] = useState<Take[]>(post.takes ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(async (text: string) => {
    if (!post.projectId) return;
    setBusy(true); setError("");
    try {
      const qs = new URLSearchParams({ projectId: post.projectId, q: text, tipo, sub });
      const r = await fetch(`/api/portal/lume/takes/?${qs}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui buscar no Lume.");
      setFound(d.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); setFound([]); } finally { setBusy(false); }
  }, [post.projectId, tipo, sub]);
  useEffect(() => { const t = setTimeout(() => void search(q), 0); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps -- refaz só ao trocar filtro

  const has = (id: number) => chosen.some((t) => t.id === id);
  const flip = (x: Found) => setChosen((c) => (has(x.id) ? c.filter((t) => t.id !== x.id) : [...c, { id: x.id, nome: x.nome, t: x.segundo, by: null, at: new Date().toISOString() }]));
  async function save() {
    setBusy(true); setError("");
    try { await send(`/api/portal/posts/${post.id}/takes/`, "PUT", { takes: chosen }); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "Erro."); setBusy(false); }
  }

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-3" role="dialog" aria-label="Escolher takes no Lume">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg">Takes para “{post.title}”</h2>
            <p className="kb-faint text-xs">Busque pelo que aparece na cena (ex.: piscina ao pôr do sol). Toque para marcar.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void search(q); }} className="flex gap-2">
          <input className="kb-control min-h-12 min-w-0 flex-1 text-base" value={q} onChange={(e) => setQ(e.target.value)} placeholder="O que você procura?" aria-label="Buscar no Lume" />
          <button className="kb-btn min-h-12" disabled={busy}>Buscar</button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {([["video", "Vídeos"], ["foto", "Fotos"], ["", "Tudo"]] as const).map(([k, l]) => <button key={k || "tudo"} type="button" className="kb-chip min-h-9" aria-pressed={tipo === k} onClick={() => setTipo(k)}>{l}</button>)}
          <span className="mx-1 w-px self-stretch bg-white/10" aria-hidden />
          {["", ...BRANDS].map((b) => <button key={b || "todas"} type="button" className="kb-chip min-h-9" aria-pressed={sub === b} onClick={() => setSub(b)}>{b || "Todas"}</button>)}
        </div>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
          {found === null || (busy && !found.length) ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="kb-skel aspect-video" />) : found.map((x) => (
            <button key={x.id} type="button" onClick={() => flip(x)} aria-pressed={has(x.id)} aria-label={`${x.nome}${x.segundo !== null ? ` em ${mmss(x.segundo)}` : ""}`}
              className={`relative overflow-hidden rounded-xl border-2 transition-transform active:scale-95 ${has(x.id) ? "border-[#E80EFD]" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pelo proxy do portal */}
              <img src={x.thumb} alt="" loading="lazy" className="aspect-video w-full bg-white/5 object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[10px]">{x.segundo !== null && x.tipo === "video" ? `${mmss(x.segundo)} · ` : ""}{x.nome}</span>
              {has(x.id) && <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E80EFD] text-xs font-bold text-white">✓</span>}
            </button>
          ))}
          {found && !busy && found.length === 0 && !error && <p className="kb-muted col-span-3 py-6 text-center text-sm">Nada encontrado. Tente outras palavras.</p>}
        </div>
        <button type="button" className="kb-btn min-h-12 w-full" disabled={busy} onClick={() => void save()}>Salvar {chosen.length} take{chosen.length === 1 ? "" : "s"}</button>
      </div>
    </div>
  );
}

/** Plano do mês dividido entre as empresas. A gestão remaneja: aumentar uma exige sobrar no total (ou diminuir outra). */
function PoolCard({ pool, monthName, onChanged }: { pool: Pool; monthName: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const shares = pool.ops.reduce((s, o) => s + (o.limit ?? 0), 0);
  const free = pool.limit === null ? Infinity : pool.limit - shares;
  async function bump(id: string, delta: number) {
    const op = pool.ops.find((o) => o.id === id)!;
    const next = (op.limit ?? 0) + delta;
    if (delta > 0 && free <= 0) { setMsg("O plano já está todo distribuído: diminua de outra empresa primeiro."); return; }
    if (next < Math.max(1, op.used)) { setMsg(next < 1 ? "Cada empresa precisa de pelo menos 1 post." : `${op.titulo} já tem ${op.used} posts neste mês.`); return; }
    setBusy(true); setMsg("");
    try { await send("/api/portal/plan/", "PUT", { rootId: pool.rootId, limits: { [id]: next } }); onChanged(); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  return (
    <div className="kb-card gap-3" aria-label="Plano do mês por empresa">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">Plano de {monthName}</span>
        <b className="tabular-nums text-sm">{pool.limit === null ? pool.used : `${pool.used} de ${pool.limit}`}</b>
      </div>
      {pool.ops.map((o) => (
        <div key={o.id} className="grid gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-sm"><i aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: brandColor(brandOf(o.titulo)) ?? "#999" }} />{o.titulo}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {pool.manage && <button type="button" className="kb-chip min-h-9 min-w-9" aria-label={`Menos um post para ${o.titulo}`} disabled={busy} onClick={() => void bump(o.id, -1)}>−</button>}
              <span className="w-14 text-center text-sm tabular-nums">{o.used}/{o.limit ?? "∞"}</span>
              {pool.manage && <button type="button" className="kb-chip min-h-9 min-w-9" aria-label={`Mais um post para ${o.titulo}`} disabled={busy} onClick={() => void bump(o.id, 1)}>+</button>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${o.limit ? Math.min(100, (o.used / o.limit) * 100) : 0}%`, background: brandColor(brandOf(o.titulo)) ?? "#8a6cf0" }} /></div>
        </div>
      ))}
      {pool.manage && <p className="kb-faint text-xs">{free > 0 && free !== Infinity ? `${free} post${free > 1 ? "s" : ""} sem empresa definida. ` : ""}Para dar mais a uma empresa, tire de outra: o total do plano não muda.</p>}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
