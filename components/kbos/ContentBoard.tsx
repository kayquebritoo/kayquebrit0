"use client";
import Image from "next/image";
import ContentReview from "./ContentReview";
import PostPublications from "./PostPublications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLIENT_HUBS, lumeHref } from "@/lib/kbos/client-hubs";
import { BRAND_LIST, brandColor } from "@/lib/kbos/brand-colors";
import { effectivePostLimit } from "@/lib/kbos/plan-limit";

type Post = {
  id: string; projectId: string | null; brand: string | null; title: string; format: string; scheduledAt: string | null;
  status: string; script: string | null; caption: string | null; mediaUrl: string | null; clientNote: string | null; copies: number; postedUrl: string | null;
  networks?: string[]; scriptBy: string | null; captureBy: string | null; editor: string | null; errorMessage: string | null;
  takes?: { id: number; nome: string; t: number | null; by: string | null }[];
};
type Project = { id: string; titulo: string; categoria?: string; postLimit?: number | null };

// Etapas na ordem do fluxo (cor = o que a pessoa vê no calendário).
const STATUS: { id: string; label: string; color: string }[] = [
  { id: "roteiro", label: "Roteiro", color: "#9a93a8" },
  { id: "captacao", label: "Captação", color: "#4DA3FF" },
  { id: "producao", label: "Em edição", color: "#8a6cf0" },
  { id: "aprovacao", label: "Aguardando cliente", color: "#f5c46e" },
  { id: "ajustes", label: "Ajustes", color: "#ff9f5a" },
  { id: "aprovado", label: "Aprovado", color: "#3ecf8e" },
  { id: "agendado", label: "Agendado", color: "#c08cff" },
  { id: "postado", label: "Postado", color: "#2fbf71" },
  { id: "erro", label: "Erro ao postar", color: "#ff6b6b" },
  { id: "cancelado", label: "Cancelado", color: "#5a5566" },
];
const STEPS = ["roteiro", "captacao", "producao", "aprovacao", "aprovado", "postado"];
const STEP_LABEL: Record<string, string> = { roteiro: "Roteiro", captacao: "Captação", producao: "Edição", aprovacao: "Aprovação", aprovado: "Aprovado", postado: "Postado" };
const stepIndex = (s: string) => (s === "ajustes" ? 3 : s === "agendado" ? 4 : s === "erro" ? 5 : Math.max(0, STEPS.indexOf(s)));
const FORMAT: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Flyer", story: "Story", outro: "Post" };
const FORMAT_SHORT: Record<string, string> = { reels: "R", carrossel: "C", estatico: "F", story: "S", outro: "P" };
const meta = (s: string) => STATUS.find((x) => x.id === s) ?? STATUS[0];
const BELEM = "America/Belem";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: BELEM });
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: BELEM });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: BELEM });
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: BELEM }).replace(" ", "T").slice(0, 16) : "");
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const BRAND_LOGOS: Record<string, string> = {
  Hotel: "/brands/atalaia/hotel.png",
  Lounge: "/brands/atalaia/lounge.png",
  Praça: "/brands/atalaia/praca.png",
};

function BrandLogo({ brand, size = 20 }: { brand: string | null; size?: number }) {
  const src = brand ? BRAND_LOGOS[brand] : undefined;
  if (!src) return null;
  return <Image src={src} alt="" title={brand ?? undefined} width={size} height={size} sizes={`${size}px`} className="shrink-0 rounded-sm bg-white object-contain p-px" style={{ width: size, height: size }} />;
}

function people(p: Post) {
  return [p.scriptBy && `Roteiro: ${p.scriptBy}`, p.captureBy && `Capta: ${p.captureBy}`, p.editor && `Edita: ${p.editor}`].filter(Boolean).join(" · ");
}

function StatusTag({ status }: { status: string }) {
  const m = meta(status);
  return (
    <span className="kb-tag shrink-0 gap-1.5">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export default function ContentBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [view, setView] = useState<"calendario" | "lista">("calendario");
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Post | null>(null);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string>(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/projects", { cache: "no-store" });
        const d = await r.json();
        const all: Project[] = (d.items || []).map((p: Project) => ({ id: p.id, titulo: p.titulo, categoria: p.categoria, postLimit: p.postLimit ?? null }));
        // só clientes recorrentes de redes sociais (categoria "social"); projetos pontuais (marca, site…) nunca entram
        const list = all.filter((p) => p.categoria === "social");
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

  async function syncMlabs() {
    setSyncing(true); setNotice(""); setError("");
    try {
      const r = await fetch("/api/admin/social/mlabs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Não consegui sincronizar.");
      setNotice(`mLabs sincronizada: ${d.created} novo(s), ${d.updated} atualizado(s) (${d.found} posts lidos).${d.ambiguous ? ` ${d.ambiguous} correspondência(s) precisam de revisão em Conferir possíveis repetidos.` : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setSyncing(false); }
  }

  const shown = useMemo(() => (items ?? []).filter((p) => filter === "all" || p.status === filter), [items, filter]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const s of STATUS) c[s.id] = (items ?? []).filter((p) => p.status === s.id).length;
    return c;
  }, [items]);
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of shown) {
      const k = p.scheduledAt ? dayKey(p.scheduledAt) : "sem-data";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [shown]);
  const names = useMemo(() => [...new Set((items ?? []).flatMap((p) => [p.scriptBy, p.captureBy, p.editor]).filter(Boolean) as string[])], [items]);

  const cells = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const start = new Date(Date.UTC(y, m - 1, 1 - first.getUTCDay()));
    const days = Math.ceil((first.getUTCDay() + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      return { key: d.toISOString().slice(0, 10), n: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
    });
  }, [month]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: BELEM });
  function shift(delta: number) {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y, m - 1 + delta, 1)));
  }
  const monthName = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const dayPosts = byDay.get(selected) ?? [];
  const undated = byDay.get("sem-data") ?? [];

  const row = (p: Post) => (
    <button key={p.id} type="button" className="kb-row w-full text-left" onClick={() => setOpen(p)}>
      <span className="min-w-0">
        <span className="kb-ink block truncate text-[14px]">{p.title}</span>
        <span className="kb-faint flex items-center gap-1.5 truncate text-[12px]"><BrandLogo brand={p.brand} />{[p.scheduledAt && hhmm(p.scheduledAt) !== "00:00" ? hhmm(p.scheduledAt) : null, p.brand, FORMAT[p.format] ?? "Post", p.networks?.length ? `${p.networks.length} ${p.networks.length === 1 ? "rede" : "redes"}` : p.copies > 1 ? `${p.copies} cópias na origem` : null].filter(Boolean).join(" · ")}</span>
        {people(p) && <span className="kb-muted block truncate text-[12px]">{people(p)}</span>}
        {p.status === "erro" && p.errorMessage && <span className="block truncate text-[12px] text-[var(--kb-late)]">{p.errorMessage}</span>}
      </span>
      <StatusTag status={p.status} />
    </button>
  );

  return (
    <div className="kb-page mx-auto w-full max-w-6xl space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Projeto" className="kb-control min-h-11 max-w-full flex-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.length === 0 && <option value="">Sem projetos</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
        </select>
        <div className="kb-seg" role="group" aria-label="Visualização">
          {([["calendario", "Calendário"], ["lista", "Lista"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <button type="button" className="kb-btn min-h-11" disabled={!projectId || syncing} onClick={() => void syncMlabs()}>{syncing ? "Sincronizando…" : "Sincronizar mLabs"}</button>
        <button type="button" className="kb-btn-ghost min-h-11" disabled={!projectId} onClick={() => setImporting(true)}>Importar / colar status</button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" className="kb-chip min-h-11 min-w-11" onClick={() => shift(-1)}>‹</button>
        <p className="font-display kb-ink text-lg capitalize">{monthName}</p>
        <button type="button" aria-label="Próximo mês" className="kb-chip min-h-11 min-w-11" onClick={() => shift(1)}>›</button>
      </div>

      <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
        {[{ id: "all", label: "Todos", color: "" }, ...STATUS].map((s) => (
          <button key={s.id} type="button" className="kb-chip" aria-pressed={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.color && <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />}
            {s.label}<span className="kb-faint tabular-nums">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {notice && <p role="status" className="kb-tag w-full justify-start rounded-xl! px-3! py-2! text-sm">{notice}</p>}
      {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
      {!items && !error && <div className="kb-skel h-64 w-full" />}

      {items && projectId && <ContentReview key={`${projectId}:${month}`} projectId={projectId} month={month} onOpenPost={(id) => { const post = items.find(item => item.id === id); if (post) setOpen(post); }} />}

      {items && view === "calendario" && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Empresas">
            {BRAND_LIST.map((b) => (
              <span key={b} className="kb-muted inline-flex items-center gap-1.5 text-[12px]">
                <BrandLogo brand={b} size={24} />{b}
                <span className="kb-faint tabular-nums">{(items ?? []).filter((p) => p.brand === b).length}</span>
              </span>
            ))}
            <span className="kb-faint ml-auto text-[12px] tabular-nums">{(() => { const pr = projects.find((x) => x.id === projectId); const lim = pr ? effectivePostLimit(pr.categoria ?? "", pr.postLimit) : null; return lim === null ? `${items.length} no mês` : `${items.length} de ${lim} no mês`; })()}</span>
          </div>
          <div className="kb-glass overflow-hidden p-0!" role="grid" aria-label={`Calendário de ${monthName}`}>
            <div className="grid grid-cols-7 border-b border-white/10" role="row">
              {WEEK.map((w) => <div key={w} role="columnheader" className="kb-faint py-2 text-center text-[11px] uppercase tracking-wide">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((c) => {
                const list = byDay.get(c.key) ?? [];
                const sel = c.key === selected;
                return (
                  <div
                    key={c.key}
                    role="gridcell"
                    tabIndex={0}
                    aria-label={`${c.n}, ${list.length} post${list.length === 1 ? "" : "s"}`}
                    aria-selected={sel}
                    onClick={() => setSelected(c.key)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(c.key); } }}
                    className={`min-h-[58px] cursor-pointer border-b border-r border-white/5 p-1 text-left transition-colors sm:min-h-[118px] sm:p-1.5 ${c.inMonth ? "" : "opacity-40"} ${sel ? "bg-[var(--kb-chip-hover)]" : "hover:bg-[var(--kb-chip)]"}`}
                  >
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums ${c.key === today ? "bg-gradient-to-br from-[#4F12C7] to-[#E80EFD] font-semibold text-white" : "kb-muted"}`}>{c.n}</span>
                    {/* celular: logos compactos identificam cada empresa */}
                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {list.slice(0, 6).map((p) => <span key={p.id} aria-label={p.brand ?? meta(p.status).label}>{p.brand && BRAND_LOGOS[p.brand] ? <BrandLogo brand={p.brand} size={12} /> : <span aria-hidden className="block h-1.5 w-1.5 rounded-full" style={{ background: meta(p.status).color }} />}</span>)}
                    </div>
                    {/* tela grande: etiquetas com título */}
                    <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                      {list.slice(0, 3).map((p) => (
                        <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); setOpen(p); }} title={`${p.title} — ${meta(p.status).label}`} className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] hover:bg-white/10" style={{ borderLeft: `3px solid ${brandColor(p.brand) ?? meta(p.status).color}`, background: brandColor(p.brand) ? `${brandColor(p.brand)}14` : undefined }}>
                          <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta(p.status).color }} />
                          <BrandLogo brand={p.brand} size={18} />
                          <b className="kb-faint shrink-0">{FORMAT_SHORT[p.format] ?? "P"}</b>
                          <span className="kb-ink truncate">{p.title}</span>
                        </button>
                      ))}
                      {list.length > 3 && <span className="kb-faint px-1 text-[11px]">+{list.length - 3} mais</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <section aria-label="Posts do dia">
            <h2 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">{dayLabel(`${selected}T12:00:00-03:00`)}</h2>
            {dayPosts.length === 0 ? <p className="kb-muted py-6 text-center text-sm">Nada marcado para esse dia.</p> : dayPosts.map(row)}
          </section>
          {undated.length > 0 && (
            <section aria-label="Sem data">
              <h2 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">Sem data</h2>
              {undated.map(row)}
            </section>
          )}
        </>
      )}

      {items && view === "lista" && (
        <>
          {shown.length === 0 && <p className="kb-muted py-10 text-center text-sm">Nenhum post por aqui. Importe o calendário do mLabs ou troque o mês.</p>}
          {[...byDay.entries()].map(([k, list]) => (
            <section key={k} aria-label={k}>
              <h2 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">{k === "sem-data" ? "Sem data" : dayLabel(`${k}T12:00:00-03:00`)}</h2>
              {list.map(row)}
            </section>
          ))}
        </>
      )}

      {open && <PostEditor post={open} names={names} onClose={() => setOpen(null)} onSaved={(p) => { setItems((cur) => (cur ?? []).filter((x) => !(x.id === p.id && (p as Post & { __gone?: boolean }).__gone)).map((x) => (x.id === p.id ? p : x))); setOpen(null); void load(); }} />}
      {importing && <ImportIcs projectId={projectId} month={month} onClose={() => setImporting(false)} onDone={() => { setImporting(false); void load(); }} />}
    </div>
  );
}

function Stepper({ status }: { status: string }) {
  const at = stepIndex(status);
  const bad = status === "erro";
  return (
    <ol className="flex gap-1" aria-label="Andamento do post">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0 flex-1" aria-current={i === at ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= at ? (bad && i === at ? "bg-[var(--kb-late-dot)]" : "bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]") : "bg-white/10"}`} />
          <span className={`mt-1 block truncate text-[10px] uppercase tracking-[0.06em] ${i === at ? "font-semibold" : "kb-faint"}`}>{STEP_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

function PostEditor({ post, names, onClose, onSaved }: { post: Post; names: string[]; onClose: () => void; onSaved: (p: Post) => void }) {
  const [f, setF] = useState({
    title: post.title, status: post.status, caption: post.caption ?? "", mediaUrl: post.mediaUrl ?? "", script: post.script ?? "",
    scriptBy: post.scriptBy ?? "", captureBy: post.captureBy ?? "", editor: post.editor ?? "", when: toLocalInput(post.scheduledAt),
    postedUrl: post.postedUrl ?? "", errorMessage: post.errorMessage ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hub = CLIENT_HUBS[0];
  const pasta = hub.empresas.find((e) => e.label === post.brand)?.pasta;
  const listId = `names-${post.id}`;
  const text = (v: string) => v.trim() || null;
  const [sugg, setSugg] = useState<{ id: string; title: string; brand: string | null; format: string; status: string; scheduledAt: string | null; hasScript: boolean; scriptBy: string | null }[]>([]);
  useEffect(() => {
    if (post.status === "roteiro") return;
    let alive = true;
    fetch(`/api/admin/social/${post.id}/link`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setSugg(d.items || []); }).catch(() => undefined);
    return () => { alive = false; };
  }, [post.id, post.status]);

  async function link(scriptId: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/admin/social/${post.id}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scriptId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui vincular.");
      onSaved(d.item);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function dismiss() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/admin/social/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dismissed: true }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui dispensar.");
      onSaved({ ...d.item, dismissedAt: d.item.dismissedAt, __gone: true } as Post);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/admin/social/${post.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim() || post.title, status: f.status, caption: text(f.caption), mediaUrl: text(f.mediaUrl), script: text(f.script),
          scriptBy: text(f.scriptBy), captureBy: text(f.captureBy), editor: text(f.editor), postedUrl: text(f.postedUrl), errorMessage: f.status === "erro" ? text(f.errorMessage) : null,
          ...(f.when ? { scheduledAt: `${f.when}:00-03:00` } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
      onSaved(d.item);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

  const h = "kb-faint text-[11px] uppercase tracking-[0.18em]";
  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" role="dialog" aria-label="Editar post">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{[post.brand, FORMAT[post.format] ?? "Post", post.scheduledAt ? dayLabel(post.scheduledAt) : null].filter(Boolean).join(" · ")}</p>
            <h2 className="font-display kb-ink break-words text-lg">{post.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        <Stepper status={f.status} />
        {post.clientNote && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">Pedido do cliente: {post.clientNote}</p>}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa">
          {STATUS.map((s) => (
            <button key={s.id} type="button" className="kb-chip min-h-11" aria-pressed={f.status === s.id} onClick={() => setF({ ...f, status: s.id })}>
              <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
            </button>
          ))}
        </div>
        {f.status === "aprovacao" && post.status !== "aprovacao" && <p className="kb-faint text-xs">Ao salvar, o cliente recebe um aviso no WhatsApp com o link do portal.</p>}
        {f.status === "erro" && <label className="kb-field"><span>O que deu errado?</span><input className="kb-control" value={f.errorMessage} onChange={(e) => setF({ ...f, errorMessage: e.target.value })} placeholder="Ex.: Instagram recusou o vídeo" /></label>}

        <section className="space-y-2" aria-label="Equipe">
          <p className={h}>Quem faz o quê</p>
          <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="kb-field"><span>Roteiro por</span><input className="kb-control" list={listId} value={f.scriptBy} onChange={(e) => setF({ ...f, scriptBy: e.target.value })} /></label>
            <label className="kb-field"><span>Captação</span><input className="kb-control" list={listId} value={f.captureBy} onChange={(e) => setF({ ...f, captureBy: e.target.value })} /></label>
            <label className="kb-field"><span>Edição</span><input className="kb-control" list={listId} value={f.editor} onChange={(e) => setF({ ...f, editor: e.target.value })} /></label>
          </div>
        </section>

        <section className="space-y-2" aria-label="Publicação">
          <p className={h}>Publicação</p>
          <label className="kb-field"><span>Título</span><input className="kb-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="kb-field"><span>Data e hora</span><input className="kb-control" type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></label>
          <label className="kb-field"><span>Link do arquivo para o cliente ver (Drive, Lume…)</span><input className="kb-control" inputMode="url" placeholder="https://…" value={f.mediaUrl} onChange={(e) => setF({ ...f, mediaUrl: e.target.value })} /></label>
          <label className="kb-field"><span>Legenda</span><textarea className="kb-control" style={{ padding: "10px 14px" }} rows={4} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></label>
          {(f.status === "postado" || f.status === "erro" || post.postedUrl) && <label className="kb-field"><span>Link do post publicado</span><input className="kb-control" inputMode="url" placeholder="https://…" value={f.postedUrl} onChange={(e) => setF({ ...f, postedUrl: e.target.value })} /></label>}
        </section>

        <PostPublications postId={post.id} onPostStatus={(status) => setF((x) => ({ ...x, status }))} />

        {(post.takes?.length ?? 0) > 0 && (
          <section className="space-y-2" aria-label="Takes escolhidos">
            <p className={h}>Takes escolhidos pelo cliente</p>
            <div className="flex flex-wrap gap-1.5">
              {post.takes!.map((t) => (
                <a key={t.id} className="kb-chip min-h-10" target="_blank" rel="noopener noreferrer" href={`/api/admin/lume/entrar?ir=${encodeURIComponent(`/midia/${t.id}`)}`}>
                  {t.nome}{t.t !== null ? ` · ${Math.floor(t.t / 60)}:${String(Math.floor(t.t % 60)).padStart(2, "0")}` : ""}{t.by ? ` · ${t.by}` : ""} ↗
                </a>
              ))}
            </div>
          </section>
        )}

        {sugg.length > 0 && !f.script.trim() && (
          <section className="space-y-2" aria-label="Roteiros possíveis">
            <p className={h}>Roteiros que podem ser deste post</p>
            {sugg.map((x) => (
              <div key={x.id} className="kb-row">
                <span className="min-w-0">
                  <span className="kb-ink block truncate text-[14px]">{x.title}</span>
                  <span className="kb-faint block truncate text-[12px]">{[x.scheduledAt ? new Date(x.scheduledAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: BELEM }) : null, x.brand, FORMAT[x.format] ?? "Post", x.scriptBy ? `por ${x.scriptBy}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <button type="button" className="kb-chip min-h-11 shrink-0" disabled={busy} onClick={() => void link(x.id)}>Vincular</button>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2" aria-label="Roteiro">
          <p className={h}>Roteiro</p>
          <textarea className="kb-control" style={{ padding: "10px 14px" }} rows={8} aria-label="Roteiro" value={f.script} onChange={(e) => setF({ ...f, script: e.target.value })} />
        </section>

        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="kb-btn-ghost min-h-12" disabled={busy} title="Tira da lista de atrasados sem apagar" onClick={() => void dismiss()}>Dispensar</button>
          <a className="kb-btn-ghost min-h-12 inline-flex items-center" href={lumeHref(pasta ?? hub.pasta)}>Achar takes no Lume</a>
        </div>
      </div>
    </div>
  );
}

function ImportIcs({ projectId, month, onClose, onDone }: { projectId: string; month: string; onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<"ics" | "status">("ics");
  const [list, setList] = useState("");
  const [res, setRes] = useState<{ matched: number; postedBefore: number; restored: number; unmatched: string[] } | null>(null);
  const [text, setText] = useState("");
  const [info, setInfo] = useState<{ total: number; fresh: number; existing: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function statusRun(dryRun: boolean) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/social/production", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, month, text: list, dryRun }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não consegui ler a lista.");
      setRes(d);
      if (!dryRun) onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }

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
            <h2 className="font-display kb-ink text-lg">Importar e atualizar</h2>
            <div className="kb-seg mt-2" role="group" aria-label="Tipo de importação">
              <button type="button" aria-pressed={tab === "ics"} onClick={() => setTab("ics")}>Calendário .ics</button>
              <button type="button" aria-pressed={tab === "status"} onClick={() => setTab("status")}>Colar status</button>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="h-11 w-11 shrink-0 rounded-full text-2xl">×</button>
        </div>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        {tab === "status" && (
          <div className="space-y-2">
            <p className="kb-muted text-sm">Cole a lista da produção (dia, marca, formato e situação, como no seu bloco de notas). O KBOS acha cada post do mês e ajusta a etapa. Se escrever &quot;os demais pra trás foram postados&quot;, tudo antes da primeira linha vira Postado.</p>
            <textarea className="kb-control text-base" style={{ padding: "10px 14px" }} rows={10} aria-label="Lista da produção" value={list} onChange={(e) => { setList(e.target.value); setRes(null); }} placeholder={"* 14 - LOUNGE - Reels Chapa Mista ✅🟡 Editado / em aprovação\n* 16 - PRAÇA - Carrossel ❌ Fila de espera"} />
            {res && (
              <div className="kb-card space-y-1 p-3 text-sm">
                <p><b className="kb-ink">{res.matched}</b> posts encontrados{res.postedBefore ? ` · ${res.postedBefore} anteriores viram Postado` : ""}{res.restored ? ` · ${res.restored} restaurados da limpeza` : ""}.</p>
                {res.unmatched.length > 0 && <p className="text-[var(--kb-late)]">Não achei: {res.unmatched.join(" · ")}</p>}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" className="kb-btn-ghost min-h-12 flex-1" disabled={busy || list.trim().length < 5} onClick={() => void statusRun(true)}>Conferir</button>
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy || !res || res.matched === 0} onClick={() => void statusRun(false)}>{busy ? "Aplicando…" : "Aplicar"}</button>
            </div>
          </div>
        )}
        <input ref={input} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {tab === "ics" && (!info ? (
          <button type="button" className="kb-btn min-h-12 w-full" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Lendo…" : "Escolher arquivo .ics"}</button>
        ) : (
          <>
            <p className="kb-muted text-sm"><b className="kb-ink">{info.fresh}</b> posts novos · {info.existing} já existiam (de {info.total}).</p>
            <div className="flex gap-2">
              <button type="button" className="kb-btn min-h-12 flex-1" disabled={busy || info.fresh === 0} onClick={() => void commit()}>{busy ? "Importando…" : `Importar ${info.fresh}`}</button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => { setInfo(null); setText(""); }}>Trocar arquivo</button>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
