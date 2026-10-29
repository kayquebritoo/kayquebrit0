"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND_LIST, brandColor, brandLabel, brandsOf } from "@/lib/kbos/brand-colors";
import { contentBrand, summarizeContent } from "@/lib/kbos/content-summary";
import BrandPicker from "./BrandPicker";
import { NETWORKS, NETWORK_LABEL } from "@/lib/kbos/content-model";
import type { PubSummary } from "@/lib/kbos/content-cycle";
import {
  BELEM,
  BrandLogo,
  OpenPost,
  STATUS,
  SharedCalendarGrid,
  StateIcon,
  StatusTag,
  Stepper,
  buildMonthCells,
  dayKey,
  dayLabel,
  meta,
} from "./ContentBoard";

type Take = { id: number; nome: string; t: number | null; by: string | null; at: string };
type Post = {
  id: string;
  projectId: string | null;
  title: string;
  brand: string | null;
  collabBrands?: string[];
  format: string;
  networks: string[] | number;
  scheduledAt: string | null;
  status: string;
  caption: string | null;
  mediaUrl: string | null;
  clientNote: string | null;
  script: string | null;
  mine: boolean;
  manage: boolean;
  takes: Take[];
  people: { scriptBy: string | null; captureBy: string | null; editor: string | null } | null;
  postedUrl: string | null;
  /** Calculados no servidor pela regra única (olham cada rede). */
  phase?: string;
  late?: boolean;
  publications?: PubSummary[];
};

/** "Postado" só quando saiu em todas as redes; se falta alguma, mostra como agendado (igual à conta do mês). */
const shownStatus = (p: Pick<Post, "status" | "phase">) =>
  p.status === "postado" && p.phase && p.phase !== "publicado" ? "agendado" : p.status;

const postNetworks = (p: Pick<Post, "networks" | "publications">): string[] =>
  Array.isArray(p.networks) && p.networks.length > 0
    ? p.networks
    : p.publications?.length
      ? p.publications.map((pub) => pub.network)
      : [];

type Proj = { id: string; titulo: string; manage?: boolean; parentId?: string | null };
type Pool = {
  rootId: string;
  titulo: string;
  limit: number | null;
  used: number;
  manage: boolean;
  ops: { id: string; titulo: string; limit: number | null; used: number }[];
};
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Empresa de uma operação pelo título ("Hotel Atalaia VIP" → Hotel). */
const brandOf = (titulo: string) => BRAND_LIST.find((b) => plain(titulo).includes(plain(b))) ?? null;
const FORMAT: Record<string, string> = {
  reels: "Vídeo (Reels)",
  carrossel: "Carrossel",
  estatico: "Post estático",
  story: "Story",
  outro: "Post",
};
const PUB_COLOR: Record<string, string> = {
  pendente: "#9a93a8",
  agendado: "#f472b6",
  publicado: "#22c55e",
  erro: "#ff5c5c",
  cancelado: "#5a5566",
};
const PUB_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  publicado: "Publicado",
  erro: "Erro",
  cancelado: "Cancelado",
};
const BRANDS = BRAND_LIST;
/** Empresas que existem para ESTE cliente (pelas operações dele e pelos posts): quem não é do grupo não vê Hotel/Lounge/Praça. */
const brandsFor = (projects: Proj[], posts: { brand: string | null; collabBrands?: string[] }[] = []) =>
  BRANDS.filter((b) => projects.some((p) => brandOf(p.titulo) === b) || posts.some((p) => brandsOf(p).includes(b)));
const mmss = (t: number | null) =>
  t === null ? "" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
type Quota = { limit: number | null; used: number; byFormat: Record<string, number> };

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Não consegui salvar.");
  return d;
}

/** Calendário de conteúdo do portal — compartilha o mesmo grid, filtros, etapas sólidas e componentes do calendário administrativo. */
export default function PortalPosts() {
  const [items, setItems] = useState<Post[] | null>(null);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }).slice(0, 7));
  const [view, setView] = useState<"calendario" | "lista">("calendario");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: BELEM }));
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const [picking, setPicking] = useState<Post | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [summary, setSummary] = useState<{ total: number; published: number; late: number } | null>(null);
  const [brand, setBrand] = useState("");
  const dayListRef = useRef<HTMLElement>(null);

  const pickDay = (key: string, hasPosts: boolean) => {
    setSelected(key);
    if (hasPosts && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        dayListRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }),
      );
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/posts?month=${month}`, { cache: "no-store" });
      if (!r.ok) {
        setItems([]);
        return;
      }
      const d = await r.json();
      setItems(d.items || []);
      setProjects(d.projects || []);
      setQuota(d.quota ?? null);
      setPools(d.pools ?? []);
      setSummary(d.summary ?? null);
    } catch {
      setItems([]);
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial dos posts
    void load();
  }, [load]);

  async function decide(id: string, decision: "aprovar" | "ajustes") {
    setBusy(id);
    setError("");
    try {
      await send(`/api/portal/posts/${id}`, "POST", { decision, note: decision === "ajustes" ? note : null });
      setAsking(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(null);
    }
  }

  const matchingProjectIds = useMemo(() => {
    if (!projectId) return null;
    const ids = new Set([projectId]);
    for (const p of projects) {
      if (p.parentId === projectId) ids.add(p.id);
    }
    return ids;
  }, [projectId, projects]);

  const monthScoped = useMemo(
    () =>
      (items ?? []).filter(
        (p) =>
          (!matchingProjectIds || (p.projectId !== null && matchingProjectIds.has(p.projectId))) &&
          Boolean(p.scheduledAt && dayKey(p.scheduledAt).startsWith(month)),
      ),
    [items, matchingProjectIds, month],
  );
  const brands = useMemo(() => brandsFor(projects, items ?? []), [projects, items]);
  const monthSummary = useMemo(() => summarizeContent(monthScoped, brands), [monthScoped, brands]);
  const activeMonthScoped = monthSummary.contents.filter((p) => p.status !== "cancelado");
  const brandItems = useMemo(
    () => monthSummary.contents.filter((p) => !brand || brandsOf(p).includes(brand)),
    [monthSummary.contents, brand],
  );
  const activeBrandItems = useMemo(
    () => brandItems.filter((p) => p.status !== "cancelado"),
    [brandItems],
  );
  const shown = useMemo(
    () => brandItems.filter((p) => filter === "all" || shownStatus(p) === filter),
    [brandItems, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: activeBrandItems.length };
    for (const s of STATUS) c[s.id] = brandItems.filter((p) => shownStatus(p) === s.id).length;
    return c;
  }, [activeBrandItems, brandItems]);
  const brandCounts = useMemo(
    () => Object.fromEntries(brands.map((b) => [b, monthSummary.byBrand.get(b) ?? 0])),
    [brands, monthSummary.byBrand],
  );
  const manager = projects.some((p) => p.manage);
  const scopedSummary = useMemo(() => {
    if (brand) {
      const primary = monthSummary.contents.filter((p) => contentBrand(p.brand) === brand);
      const s = summarizeContent(primary);
      return { total: s.total, published: s.published, late: s.late, internalHidden: 0 };
    }
    const hasProjectFilter = matchingProjectIds !== null && matchingProjectIds.size < projects.length;
    if (hasProjectFilter || manager) {
      return {
        total: monthSummary.total,
        published: monthSummary.published,
        late: monthSummary.late,
        internalHidden: 0,
      };
    }
    if (!summary) return null;
    const internalHidden = Math.max(0, summary.total - monthSummary.total);
    return { ...summary, internalHidden };
  }, [brand, matchingProjectIds, projects.length, manager, monthSummary, summary]);
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of shown) {
      if (p.status === "cancelado" && filter !== "cancelado") continue;
      if (p.scheduledAt) m.set(dayKey(p.scheduledAt), [...(m.get(dayKey(p.scheduledAt)) ?? []), p]);
    }
    return m;
  }, [shown, filter]);
  const cells = useMemo(() => buildMonthCells(month), [month]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: BELEM });
  const shift = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthName = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (!items) return null;
  if (items.length === 0 && projects.length === 0) return null;
  const waiting = brandItems.filter((p) => p.status === "aprovacao");
  const dayPosts = byDay.get(selected) ?? [];
  const planned = brandItems.filter(
    (p) => p.status === "roteiro" && p.scheduledAt && dayKey(p.scheduledAt).startsWith(month),
  ).length;
  const canEdit = (p: Post) => p.status !== "postado" && (p.manage || (p.mine && p.status === "roteiro"));

  const renderRow = (p: Post) => {
    const st = shownStatus(p);
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(p)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setEditing(p);
          }
        }}
        className={`kb-row w-full cursor-pointer text-left ${p.status === "cancelado" ? "opacity-50" : ""}`}
      >
        <span className="min-w-0">
          <span className={`kb-ink block truncate text-[14px] ${p.status === "cancelado" ? "line-through" : ""}`}>
            {p.title}
          </span>
          <span className="kb-faint flex items-center gap-1.5 truncate text-[12px]">
            {brandsOf(p).map((b) => (
              <BrandLogo key={b} brand={b} />
            ))}
            {[
              brandLabel(p),
              FORMAT[p.format] ?? "Post",
              postNetworks(p).length ? postNetworks(p).map((n) => NETWORK_LABEL[n] ?? n).join(", ") : null,
              p.takes?.length ? `${p.takes.length} take${p.takes.length > 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {p.manage && p.people && (
            <span className="kb-faint block truncate text-[11px]">
              {[
                p.people.scriptBy && `Roteiro: ${p.people.scriptBy}`,
                p.people.captureBy && `Capta: ${p.people.captureBy}`,
                p.people.editor && `Edita: ${p.people.editor}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {p.publications && p.publications.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {p.publications.map((pub) => (
                <span key={pub.network} className="kb-chip min-h-6 gap-1 !px-2 !py-0.5 !text-[10px]">
                  <i
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: PUB_COLOR[pub.status] ?? "#9a93a8" }}
                  />
                  {NETWORK_LABEL[pub.network] ?? pub.network}: {PUB_LABEL[pub.status] ?? pub.status}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <OpenPost url={p.postedUrl} className="min-h-8 min-w-8" />
          <StatusTag status={st} client late={p.late} />
        </span>
      </div>
    );
  };

  return (
    <section className="kb-glass flex flex-col gap-4 p-5" aria-label="Calendário de conteúdo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">
            {manager ? "Calendário editorial · gestão" : "Conteúdo das redes"}
          </p>
          <h2 className="font-display mt-1 text-xl">
            {waiting.length
              ? `${waiting.length} post${waiting.length > 1 ? "s" : ""} esperando sua aprovação`
              : manager
                ? "Planeje o mês"
                : "Calendário de posts"}
          </h2>
          {manager && planned > 0 && (
            <p className="kb-muted mt-1 text-sm">
              {planned} conteúdo{planned > 1 ? "s" : ""} planejado{planned > 1 ? "s" : ""} aguardando a equipe começar.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 1 && (
            <select
              aria-label="Projeto"
              className="kb-control min-h-11 max-w-full"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Todos os projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          )}
          <div className="kb-seg" role="group" aria-label="Visualização">
            {(
              [
                ["calendario", "Calendário"],
                ["lista", "Lista"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
          {projects.length > 0 && (
            <button type="button" className="kb-btn min-h-11 shrink-0" onClick={() => setEditing("new")}>
              + {manager ? "Conteúdo" : "Roteiro"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}

      {waiting.map((p) => (
        <article key={p.id} className="kb-card gap-3">
          <div className="min-w-0">
            <p className="kb-faint flex flex-wrap items-center gap-1.5 text-xs">
              {brandsOf(p).map((b) => (
                <BrandLogo key={b} brand={b} size={18} />
              ))}
              <span>
                {[brandLabel(p), FORMAT[p.format] ?? "Post", p.scheduledAt ? dayLabel(p.scheduledAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
            <h3 className="mt-1 break-words text-base font-medium">{p.title}</h3>
            {p.caption && <p className="kb-muted mt-2 whitespace-pre-wrap break-words text-sm">{p.caption}</p>}
          </div>
          {p.mediaUrl && (
            <a
              href={p.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="kb-btn-ghost inline-flex min-h-11 items-center self-start"
            >
              Ver arte / vídeo ↗
            </a>
          )}
          {asking === p.id ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="kb-control"
                style={{ padding: "10px 14px" }}
                rows={3}
                maxLength={1000}
                placeholder="O que precisa mudar?"
                aria-label="O que precisa mudar"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="kb-btn min-h-11 flex-1"
                  disabled={busy === p.id || !note.trim()}
                  onClick={() => void decide(p.id, "ajustes")}
                >
                  Enviar pedido
                </button>
                <button
                  type="button"
                  className="kb-btn-ghost min-h-11"
                  onClick={() => {
                    setAsking(null);
                    setNote("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="kb-btn min-h-12 flex-1"
                disabled={busy === p.id}
                onClick={() => void decide(p.id, "aprovar")}
              >
                {busy === p.id ? "Enviando…" : "Aprovar"}
              </button>
              <button type="button" className="kb-btn-ghost min-h-12" onClick={() => setAsking(p.id)}>
                Pedir ajustes
              </button>
            </div>
          )}
        </article>
      ))}

      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Mês anterior" className="kb-chip min-h-11 min-w-11" onClick={() => shift(-1)}>
          ‹
        </button>
        <p className="font-display text-base capitalize">{monthName}</p>
        <button type="button" aria-label="Próximo mês" className="kb-chip min-h-11 min-w-11" onClick={() => shift(1)}>
          ›
        </button>
      </div>

      {scopedSummary && (scopedSummary.total > 0 || scopedSummary.late > 0) && (
        <p className="kb-muted text-sm tabular-nums" aria-label={`Resumo de ${monthName}`}>
          {scopedSummary.total} no mês · {scopedSummary.published} publicado{scopedSummary.published === 1 ? "" : "s"} ·{" "}
          <span className={scopedSummary.late ? "text-[var(--kb-late)]" : ""}>
            {scopedSummary.late} atrasado{scopedSummary.late === 1 ? "" : "s"}
          </span>
          {scopedSummary.internalHidden > 0 && (
            <span className="kb-faint ml-2 text-xs">
              · {scopedSummary.internalHidden} em produção com a equipe
            </span>
          )}
          <span className="kb-faint ml-2 text-xs">· 1 conteúdo = 1 entrega (status independente por rede)</span>
        </p>
      )}

      {pools.map((pl) => (
        <PoolCard key={pl.rootId} pool={pl} monthName={monthName} onChanged={() => void load()} />
      ))}
      {quota && (
        <div className="kb-card gap-2" aria-label="Posts do mês">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm">Posts de {monthName}</span>
            <b className="tabular-nums text-sm">
              {quota.limit === null ? quota.used : `${quota.used} de ${quota.limit}`}
            </b>
          </div>
          {quota.limit !== null && (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={quota.limit}
              aria-valuenow={quota.used}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, (quota.used / quota.limit) * 100)}%`,
                  background: quota.used >= quota.limit ? "#2dd4bf" : "#8a6cf0",
                }}
              />
            </div>
          )}
          <p className="kb-faint text-xs">
            {["carrossel", "estatico", "reels"]
              .map(
                (k) =>
                  `${quota.byFormat[k] ?? 0} ${k === "carrossel" ? "carrossel" : k === "estatico" ? "estático" : "vídeo"}`,
              )
              .join(" · ")}
            {quota.limit !== null && quota.used >= quota.limit ? " · limite do mês atingido" : ""}
          </p>
        </div>
      )}

      <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por etapa">
        {[{ id: "all", label: "Todos", clientLabel: "Todos", color: "" }, ...STATUS].map((s) => (
          <button
            key={s.id}
            type="button"
            className="kb-chip"
            aria-pressed={filter === s.id}
            onClick={() => setFilter(s.id)}
          >
            {s.color && <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />}
            {s.clientLabel ?? s.label}
            <span className="kb-faint tabular-nums">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {brands.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por empresa">
          <button
            type="button"
            className="kb-chip min-h-11"
            aria-pressed={brand === ""}
            onClick={() => setBrand("")}
          >
            Todas as empresas <span className="kb-faint tabular-nums">{activeMonthScoped.length}</span>
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              className="kb-chip min-h-11 gap-1.5"
              aria-pressed={brand === b}
              onClick={() => setBrand(brand === b ? "" : b)}
            >
              <BrandLogo brand={b} size={20} />
              {b}
              <span className="kb-faint tabular-nums">{brandCounts[b] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {view === "calendario" ? (
        <>
          <SharedCalendarGrid
            monthName={monthName}
            cells={cells}
            byDay={byDay}
            selected={selected}
            today={today}
            expandedDay={expandedDay}
            setSelected={setSelected}
            setExpandedDay={setExpandedDay}
            onPickDay={pickDay}
            onOpenPost={(p) => setEditing(p)}
            statusOf={shownStatus}
          />

          <section ref={dayListRef} aria-label="Posts do dia" className="scroll-mt-24">
            <h3 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">
              {dayLabel(`${selected}T12:00:00-03:00`)}
            </h3>
            {dayPosts.length === 0 ? (
              <p className="kb-muted py-4 text-center text-sm">Nada marcado para esse dia.</p>
            ) : (
              dayPosts.map(renderRow)
            )}
            {projects.length > 0 && (
              <button
                type="button"
                className="kb-btn-ghost mt-2 min-h-11 w-full"
                onClick={() => setEditing("new")}
              >
                + {manager ? "Planejar conteúdo" : "Cadastrar roteiro"} neste dia
              </button>
            )}
          </section>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.length === 0 && (
            <p className="kb-muted py-8 text-center text-sm">Nenhum conteúdo neste mês com esse filtro.</p>
          )}
          {[...byDay.entries()].map(([k, list]) => (
            <section key={k} aria-label={k}>
              <h3 className="kb-faint mb-1 text-[12px] uppercase tracking-wide">
                {dayLabel(`${k}T12:00:00-03:00`)}
              </h3>
              {list.map(renderRow)}
            </section>
          ))}
        </div>
      )}

      {editing && (
        <ContentEditor
          post={editing === "new" ? null : editing}
          canEdit={editing === "new" ? true : canEdit(editing)}
          projects={projects}
          date={selected}
          onClose={() => setEditing(null)}
          onDecide={decide}
          onPickTakes={(p) => {
            setEditing(null);
            setPicking(p);
          }}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {picking && (
        <TakesPicker
          post={picking}
          onClose={() => {
            setPicking(null);
            void load();
          }}
          onDone={() => {
            setPicking(null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function PortalPublications({ post }: { post: Post }) {
  const pubs: PubSummary[] =
    post.publications && post.publications.length > 0
      ? post.publications
      : postNetworks(post).map((n) => ({
          network: n,
          status: post.status === "postado" ? "publicado" : post.status === "agendado" ? "agendado" : "pendente",
          url: post.status === "postado" ? post.postedUrl : null,
        }));
  if (pubs.length === 0) return null;
  return (
    <section className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3" aria-label="Status por rede">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="kb-faint text-[11px] uppercase tracking-[0.18em]">Redes · 1 conteúdo = 1 entrega</p>
        <span className="kb-faint text-[11px]">Status por rede</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pubs.map((p) => {
          const color = PUB_COLOR[p.status] ?? "#9a93a8";
          return (
            <span key={p.network} className="kb-chip min-h-8 gap-1.5 !text-xs">
              <i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
              <span>{NETWORK_LABEL[p.network] ?? p.network}</span>
              <span className="kb-faint">·</span>
              <span style={{ color }}>{PUB_LABEL[p.status] ?? p.status}</span>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 text-[#22c55e] underline"
                  aria-label={`Ver publicação no ${NETWORK_LABEL[p.network] ?? p.network}`}
                >
                  ↗
                </a>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function ContentEditor({
  post,
  canEdit,
  projects,
  date,
  onClose,
  onDone,
  onPickTakes,
  onDecide,
}: {
  post: Post | null;
  canEdit: boolean;
  projects: Proj[];
  date: string;
  onClose: () => void;
  onDone: () => void;
  onPickTakes: (p: Post) => void;
  onDecide: (id: string, decision: "aprovar" | "ajustes") => Promise<void>;
}) {
  const ops = projects.filter((p) => p.parentId);
  const firstManaged = ops.find((p) => p.manage) ?? projects.find((p) => p.manage) ?? projects[0];
  const [f, setF] = useState(() => ({
    projectId: post?.projectId ?? firstManaged?.id ?? "",
    date: post?.scheduledAt ? dayKey(post.scheduledAt) : date,
    brands: post
      ? brandsOf(post)
      : firstManaged && brandOf(firstManaged.titulo)
        ? [brandOf(firstManaged.titulo)!]
        : [],
    format: post?.format ?? "reels",
    title: post?.title ?? "",
    script: post?.script ?? "",
    caption: post?.caption ?? "",
    networks: post && postNetworks(post).length ? postNetworks(post) : ["instagram"],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const manage = post ? post.manage : !!projects.find((p) => p.id === f.projectId)?.manage;
  const toggle = (n: string) =>
    setF((x) => ({
      ...x,
      networks: x.networks.includes(n) ? x.networks.filter((y) => y !== n) : [...x.networks, n],
    }));

  async function save(then?: (p: Post) => void) {
    setBusy(true);
    setError("");
    try {
      const common = {
        title: f.title,
        brand: f.brands[0] ?? null,
        collabBrands: f.brands.slice(1),
        format: f.format,
        script: f.script || null,
        ...(manage ? { caption: f.caption || null, networks: f.networks } : {}),
      };
      let id = post?.id ?? "";
      if (post) await send(`/api/portal/posts/${post.id}`, "PATCH", { ...common, date: f.date });
      else id = (await send("/api/portal/posts", "POST", { ...common, projectId: f.projectId, date: f.date })).id;
      if (then)
        then({
          ...(post ?? { status: "roteiro", mine: true, manage, takes: [], networks: f.networks }),
          id,
          projectId: f.projectId,
          title: f.title,
          brand: f.brands[0] ?? null,
          collabBrands: f.brands.slice(1),
          format: f.format,
        } as Post);
      else onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(status: "cancelado" | "roteiro") {
    if (!post) return;
    if (
      status === "cancelado" &&
      !confirm(`Cancelar "${post.title}"? Ele sai da contagem do mês (dá para reativar depois).`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await send(`/api/portal/posts/${post.id}`, "PATCH", { status });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      setBusy(false);
    }
  }

  const status = post ? shownStatus(post) : undefined;
  const stMeta = status ? meta(status) : null;
  const ready = f.title.trim().length >= 2 && !!f.date && !!f.projectId;
  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="kb-modal space-y-3"
        role="dialog"
        aria-label={post ? "Detalhes do conteúdo" : "Novo conteúdo"}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {post && (
              <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">
                {[brandLabel(post), FORMAT[post.format] ?? "Post", post.scheduledAt ? dayLabel(post.scheduledAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <h2 className="font-display kb-ink break-words text-lg">
              {post ? post.title : manage ? "Novo conteúdo" : "Novo roteiro"}
            </h2>
            {stMeta && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: stMeta.color }}>
                <StateIcon status={status!} size={12} />
                {stMeta.clientLabel ?? stMeta.label}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-11 w-11 shrink-0 rounded-full text-2xl"
          >
            ×
          </button>
        </div>

        {post && status && <Stepper status={status} />}
        {post && <PortalPublications post={post} />}

        {post && post.mediaUrl && (
          <a
            href={post.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="kb-btn-ghost inline-flex min-h-11 items-center self-start"
          >
            Ver arte / vídeo ↗
          </a>
        )}
        {post && post.postedUrl && (
          <a
            href={post.postedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="kb-chip inline-flex min-h-10 items-center self-start text-xs text-[#22c55e]"
          >
            Abrir post publicado ↗
          </a>
        )}

        {post && post.status === "aprovacao" && (
          <div className="flex gap-2">
            <button
              type="button"
              className="kb-btn min-h-11 flex-1"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onDecide(post.id, "aprovar");
                setBusy(false);
                onDone();
              }}
            >
              Aprovar conteúdo
            </button>
          </div>
        )}

        {!canEdit && post ? (
          <div className="space-y-3">
            {post.caption && (
              <div className="rounded-xl bg-white/[0.03] p-3 text-sm whitespace-pre-wrap">
                <p className="kb-faint mb-1 text-[11px] uppercase tracking-[0.18em]">Legenda</p>
                {post.caption}
              </div>
            )}
            {post.script && (
              <div className="rounded-xl bg-white/[0.03] p-3 text-sm whitespace-pre-wrap">
                <p className="kb-faint mb-1 text-[11px] uppercase tracking-[0.18em]">Roteiro</p>
                {post.script}
              </div>
            )}
          </div>
        ) : (
          <>
            {!post && projects.length > 1 && (
              <label className="kb-field">
                <span>{ops.length ? "Empresa / operação" : "Projeto"}</span>
                <select
                  className="kb-control min-h-12"
                  value={f.projectId}
                  onChange={(e) => {
                    const pr = projects.find((p) => p.id === e.target.value);
                    setF({
                      ...f,
                      projectId: e.target.value,
                      brands:
                        pr && brandOf(pr.titulo)
                          ? [brandOf(pr.titulo)!, ...f.brands.filter((b) => b !== brandOf(pr.titulo))].slice(0, 3)
                          : f.brands,
                    });
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.parentId ? p.titulo : ops.length ? `${p.titulo} (todas)` : p.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="kb-field">
                <span>Dia</span>
                <input
                  className="kb-control min-h-12 text-base"
                  type="date"
                  value={f.date}
                  onChange={(e) => setF({ ...f, date: e.target.value })}
                />
              </label>
              <label className="kb-field">
                <span>Formato</span>
                <select
                  className="kb-control min-h-12"
                  value={f.format}
                  onChange={(e) => setF({ ...f, format: e.target.value })}
                >
                  {Object.entries(FORMAT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {brandsFor(projects, post ? [post] : []).length > 0 && (
              <BrandPicker
                brands={brandsFor(projects, post ? [post] : [])}
                value={f.brands}
                onChange={(brands) => setF({ ...f, brands })}
              />
            )}
            <label className="kb-field">
              <span>Título</span>
              <input
                className="kb-control min-h-12 text-base"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="Ex.: Camarão na chapa"
              />
            </label>
            {manage && (
              <div className="kb-field">
                <span>Redes</span>
                <div className="flex flex-wrap gap-1.5">
                  {NETWORKS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="kb-chip min-h-10"
                      aria-pressed={f.networks.includes(n)}
                      onClick={() => toggle(n)}
                    >
                      {NETWORK_LABEL[n]}
                    </button>
                  ))}
                </div>
                <span className="kb-faint text-xs">Um conteúdo em várias redes conta como uma entrega.</span>
              </div>
            )}
            <label className="kb-field">
              <span>Roteiro / ideia</span>
              <textarea
                className="kb-control text-base"
                style={{ padding: "10px 14px" }}
                rows={6}
                value={f.script}
                onChange={(e) => setF({ ...f, script: e.target.value })}
              />
            </label>
            {manage && (
              <label className="kb-field">
                <span>Legenda</span>
                <textarea
                  className="kb-control text-base"
                  style={{ padding: "10px 14px" }}
                  rows={4}
                  value={f.caption}
                  onChange={(e) => setF({ ...f, caption: e.target.value })}
                />
              </label>
            )}
            {post && (post.takes?.length ?? 0) > 0 && (
              <div className="kb-field">
                <span>Takes escolhidos</span>
                <div className="flex flex-wrap gap-1.5">
                  {post.takes.map((t) => (
                    <span key={t.id} className="kb-tag">
                      {t.nome}
                      {t.t !== null ? ` · ${mmss(t.t)}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
            {post?.status === "cancelado" ? (
              <button
                type="button"
                className="kb-btn min-h-12 w-full"
                disabled={busy}
                onClick={() => void setStatus("roteiro")}
              >
                Reativar como planejado
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="kb-btn min-h-12 w-full"
                  disabled={busy || !ready}
                  onClick={() => void save()}
                >
                  {busy ? "Salvando…" : "Salvar"}
                </button>
                <button
                  type="button"
                  className="kb-btn-ghost min-h-12 w-full"
                  disabled={busy || !ready}
                  onClick={() => void save(onPickTakes)}
                >
                  {post?.takes?.length ? "Trocar takes no Lume" : "Salvar e escolher takes no Lume"}
                </button>
                {post && manage && (
                  <button
                    type="button"
                    className="kb-chip min-h-11 w-full justify-center text-rose-300"
                    disabled={busy}
                    onClick={() => void setStatus("cancelado")}
                  >
                    Cancelar conteúdo
                  </button>
                )}
              </>
            )}
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
  const [tipo, setTipo] = useState<"video" | "foto" | "">(
    post.format === "reels" || post.format === "story" ? "video" : "",
  );
  const [sub, setSub] = useState(post.brand ?? "");
  const [found, setFound] = useState<Found[] | null>(null);
  const [chosen, setChosen] = useState<Take[]>(post.takes ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const search = useCallback(
    async (text: string) => {
      if (!post.projectId) return;
      setBusy(true);
      setError("");
      try {
        const qs = new URLSearchParams({ projectId: post.projectId, q: text, tipo, sub });
        const r = await fetch(`/api/portal/lume/takes/?${qs}`, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Não consegui buscar no Lume.");
        setFound(d.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
        setFound([]);
      } finally {
        setBusy(false);
      }
    },
    [post.projectId, tipo, sub],
  );
  useEffect(() => {
    const t = setTimeout(() => void search(q), 0);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps -- refaz só ao trocar filtro

  const has = (id: number) => chosen.some((t) => t.id === id);
  const flip = (x: Found) =>
    setChosen((c) =>
      has(x.id)
        ? c.filter((t) => t.id !== x.id)
        : [...c, { id: x.id, nome: x.nome, t: x.segundo, by: null, at: new Date().toISOString() }],
    );
  async function save() {
    setBusy(true);
    setError("");
    try {
      await send(`/api/portal/posts/${post.id}/takes/`, "PUT", { takes: chosen });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      setBusy(false);
    }
  }

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="kb-modal space-y-3"
        role="dialog"
        aria-label="Escolher takes no Lume"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg">Takes para “{post.title}”</h2>
            <p className="kb-faint text-xs">
              Busque pelo que aparece na cena (ex.: piscina ao pôr do sol). Toque para marcar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-11 w-11 shrink-0 rounded-full text-2xl"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(q);
          }}
          className="flex gap-2"
        >
          <input
            className="kb-control min-h-12 min-w-0 flex-1 text-base"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="O que você procura?"
            aria-label="Buscar no Lume"
          />
          <button className="kb-btn min-h-12" disabled={busy}>
            Buscar
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["video", "Vídeos"],
              ["foto", "Fotos"],
              ["", "Tudo"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k || "tudo"}
              type="button"
              className="kb-chip min-h-9"
              aria-pressed={tipo === k}
              onClick={() => setTipo(k)}
            >
              {l}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" aria-hidden />
          {["", ...BRANDS].map((b) => (
            <button
              key={b || "todas"}
              type="button"
              className="kb-chip min-h-9"
              aria-pressed={sub === b}
              onClick={() => setSub(b)}
            >
              {b || "Todas"}
            </button>
          ))}
        </div>
        {error && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{error}</p>}
        <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto">
          {found === null || (busy && !found.length)
            ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="kb-skel aspect-video" />)
            : found.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => flip(x)}
                  aria-pressed={has(x.id)}
                  aria-label={`${x.nome}${x.segundo !== null ? ` em ${mmss(x.segundo)}` : ""}`}
                  className={`relative overflow-hidden rounded-xl border-2 transition-transform active:scale-95 ${has(x.id) ? "border-[#E80EFD]" : "border-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pelo proxy do portal */}
                  <img src={x.thumb} alt="" loading="lazy" className="aspect-video w-full bg-white/5 object-cover" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[10px]">
                    {x.segundo !== null && x.tipo === "video" ? `${mmss(x.segundo)} · ` : ""}
                    {x.nome}
                  </span>
                  {has(x.id) && (
                    <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#E80EFD] text-xs font-bold text-white">
                      ✓
                    </span>
                  )}
                </button>
              ))}
          {found && !busy && found.length === 0 && !error && (
            <p className="kb-muted col-span-3 py-6 text-center text-sm">Nada encontrado. Tente outras palavras.</p>
          )}
        </div>
        <button type="button" className="kb-btn min-h-12 w-full" disabled={busy} onClick={() => void save()}>
          Salvar {chosen.length} take{chosen.length === 1 ? "" : "s"}
        </button>
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
    if (delta > 0 && free <= 0) {
      setMsg("O plano já está todo distribuído: diminua de outra empresa primeiro.");
      return;
    }
    if (next < Math.max(1, op.used)) {
      setMsg(
        next < 1 ? "Cada empresa precisa de pelo menos 1 post." : `${op.titulo} já tem ${op.used} posts neste mês.`,
      );
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await send("/api/portal/plan/", "PUT", { rootId: pool.rootId, limits: { [id]: next } });
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
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
            <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
              <i
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: brandColor(brandOf(o.titulo)) ?? "#999" }}
              />
              {o.titulo}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {pool.manage && (
                <button
                  type="button"
                  className="kb-chip min-h-9 min-w-9"
                  aria-label={`Menos um post para ${o.titulo}`}
                  disabled={busy}
                  onClick={() => void bump(o.id, -1)}
                >
                  −
                </button>
              )}
              <span className="w-14 text-center text-sm tabular-nums">
                {o.used}/{o.limit ?? "∞"}
              </span>
              {pool.manage && (
                <button
                  type="button"
                  className="kb-chip min-h-9 min-w-9"
                  aria-label={`Mais um post para ${o.titulo}`}
                  disabled={busy}
                  onClick={() => void bump(o.id, 1)}
                >
                  +
                </button>
              )}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${o.limit ? Math.min(100, (o.used / o.limit) * 100) : 0}%`,
                background: brandColor(brandOf(o.titulo)) ?? "#8a6cf0",
              }}
            />
          </div>
        </div>
      ))}
      {pool.manage && (
        <p className="kb-faint text-xs">
          {free > 0 && free !== Infinity ? `${free} post${free > 1 ? "s" : ""} sem empresa definida. ` : ""}
          Para dar mais a uma empresa, tire de outra: o total do plano não muda.
        </p>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
