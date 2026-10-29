"use client";
// Protótipo navegável do portal por empresa e módulos (Fase 3). Dados fictícios de `data.ts`: nada é lido do banco nem gravado.
import { useEffect, useMemo, useRef, useState } from "react";
import { CHANNEL_LABEL, NETWORK_LABEL, SCENARIOS, STAGE_LABEL, type Brand, type ChannelStatus, type Company, type Content, type Scenario } from "./data";

type Tab = "inicio" | "conteudo" | "marca" | "aprovacoes" | "arquivos" | "relatorio";
const ico = (d: string) => (
  <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS: Record<Tab, React.ReactNode> = {
  inicio: ico("M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10"),
  conteudo: ico("M4 5h16v15H4zM4 9h16M9 3v4M15 3v4"),
  marca: ico("M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-1.3-1-1.6-1-2.6 0-.9.7-1.7 1.7-1.7H17a4 4 0 0 0 4-4A8.6 8.6 0 0 0 12 3zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01"),
  aprovacoes: ico("M5 12.5l4 4L19 7"),
  arquivos: ico("M4 6.5A1.5 1.5 0 0 1 5.5 5H10l2 2.5h6.5A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"),
  relatorio: ico("M5 19V11M12 19V5M19 19v-6"),
};
const TABS: Record<Scenario["id"], { id: Tab; label: string }[]> = {
  marca: [{ id: "inicio", label: "Início" }, { id: "marca", label: "Marca" }, { id: "aprovacoes", label: "Aprovações" }, { id: "arquivos", label: "Arquivos" }],
  recorrente: [{ id: "inicio", label: "Início" }, { id: "conteudo", label: "Conteúdo" }, { id: "marca", label: "Marca" }, { id: "arquivos", label: "Arquivos" }, { id: "relatorio", label: "Relatório" }],
};
const STATUS_TONE: Record<ChannelStatus, string> = { publicado: "#2dd4bf", agendado: "#B79BFF", pendente: "#9a93a8", erro: "#ff8a6b" };
const day = (iso: string) => new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

export default function PortalPreview() {
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>("marca");
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const [companyId, setCompanyId] = useState("all");
  const [tab, setTab] = useState<Tab>("inicio");
  const [switcher, setSwitcher] = useState(false);
  const [toast, setToast] = useState("");
  const [contents, setContents] = useState<Content[]>(scenario.contents ?? []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2600);
  };
  const pickScenario = (id: Scenario["id"]) => {
    const s = SCENARIOS.find((x) => x.id === id)!;
    setScenarioId(id); setTab("inicio"); setCompanyId(s.companies.length > 1 ? "all" : s.companies[0].id); setContents(s.contents ?? []);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const multi = scenario.companies.length > 1;
  // empresa única: sempre ela; grupo: a escolhida ou "todas" (null)
  const company = multi ? scenario.companies.find((c) => c.id === companyId) ?? null : scenario.companies[0];
  const shown = useMemo(() => contents.filter((c) => companyId === "all" || c.company === companyId), [contents, companyId]);
  const brandCompany = company ?? scenario.companies[0];
  const tabs = TABS[scenario.id];

  return (
    <div className="kbos relative min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden"><div className="page-aurora" /></div>

      <div className="relative z-10 border-b border-white/10 bg-[#0B0B1E] px-4 py-2 text-xs">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <span className="kb-muted">Prévia com dados fictícios. Nada aqui é salvo.</span>
          <div className="kb-seg w-full sm:w-auto" role="group" aria-label="Ver como">
            {SCENARIOS.map((s) => <button key={s.id} type="button" aria-pressed={scenarioId === s.id} onClick={() => pickScenario(s.id)} className="px-3 !text-xs sm:!text-sm">{s.label}</button>)}
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#11101E]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EDE6EC] text-xs font-bold text-[#11101E]">KB</span>
          <button type="button" className="kb-btn-ghost min-h-11 min-w-0 flex-1 justify-between sm:flex-none sm:min-w-[260px]" aria-haspopup="listbox" aria-expanded={switcher} onClick={() => multi && setSwitcher((v) => !v)} disabled={!multi}>
            <span className="flex min-w-0 items-center gap-2">
              <i aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: company?.color ?? "linear-gradient(135deg,#3BA6FF,#E8B93A,#FF6A2B)" }} />
              <span className="truncate">{company?.name ?? "Grupo Atalaia VIP · todas"}</span>
            </span>
            {multi && <span aria-hidden className="kb-faint">▾</span>}
          </button>
          <span className="ml-auto hidden text-right sm:block"><span className="block text-sm">{scenario.person}</span><span className="kb-faint block text-xs">{scenario.id === "marca" ? "Titular" : "Gestão de conteúdo"}</span></span>
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--kb-accent-soft)] font-semibold">{scenario.person[0]}</span>
        </div>
        {switcher && multi && (
          <div className="kb-arrive absolute left-4 right-4 top-full z-50 mt-2 rounded-2xl border border-white/10 bg-[#11101E] p-2 shadow-2xl sm:left-[60px] sm:right-auto sm:w-[320px]" role="listbox" aria-label="Escolher empresa">
            {[{ id: "all", name: "Todas as empresas", color: "" } as Pick<Company, "id" | "name" | "color">, ...scenario.companies].map((c) => (
              <button key={c.id} type="button" role="option" aria-selected={companyId === c.id} className="kb-nav-link w-full" aria-current={companyId === c.id ? "page" : undefined} onClick={() => { setCompanyId(c.id); setSwitcher(false); }}>
                <i aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: c.color || "linear-gradient(135deg,#3BA6FF,#E8B93A,#FF6A2B)" }} />{c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="relative z-10 mx-auto flex max-w-6xl gap-6 px-4 pb-[calc(110px+env(safe-area-inset-bottom))] pt-5 lg:pb-16">
        <nav aria-label="Módulos" className="sticky top-[84px] hidden h-fit w-52 shrink-0 flex-col gap-1 lg:flex">
          {tabs.map((t) => <button key={t.id} type="button" className="kb-nav-link" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{ICONS[t.id]}{t.label}</button>)}
        </nav>
        <main key={`${scenarioId}-${tab}-${companyId}`} className="kb-page kb-stagger flex min-w-0 flex-1 flex-col gap-5">
          {tab === "inicio" && scenario.id === "marca" && <HomeBrand scenario={scenario} go={setTab} say={say} />}
          {tab === "inicio" && scenario.id === "recorrente" && <HomeRecurring scenario={scenario} contents={shown} company={company} go={setTab} />}
          {tab === "conteudo" && <ContentList contents={shown} companies={scenario.companies} multi={multi && !company} decide={(id, ok) => { setContents((cs) => cs.map((c) => (c.id === id ? { ...c, stage: ok ? "aprovado" : "ajustes" } : c))); say(ok ? "Aprovado. A equipe já pode agendar." : "Pedido de ajuste enviado para a equipe."); }} />}
          {tab === "marca" && <BrandBook brand={brandCompany.brand} say={say} note={multi && !company ? `Mostrando ${brandCompany.name}. Troque a empresa no topo para ver as outras identidades.` : ""} />}
          {tab === "aprovacoes" && <Approvals scenario={scenario} say={say} />}
          {tab === "arquivos" && <Files scenario={scenario} say={say} />}
          {tab === "relatorio" && <Report contents={shown} />}
        </main>
      </div>

      <nav className="kb-tabbar flex lg:hidden" aria-label="Módulos">
        {tabs.map((t) => <button key={t.id} type="button" className="kb-tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{ICONS[t.id]}{t.label}</button>)}
      </nav>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[80] flex justify-center lg:bottom-8">
        {toast && <p className="kb-arrive rounded-2xl border border-white/10 bg-[#1b1930] px-4 py-3 text-sm shadow-2xl">{toast}</p>}
      </div>
    </div>
  );
}

function Section({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="kb-glass p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">{eyebrow && <p className="kb-faint text-[11px] uppercase tracking-[0.22em]">{eyebrow}</p>}<h2 className="font-display mt-1 text-xl">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Hero({ hello, line, children }: { hello: string; line: string; children?: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#11101E] p-5 sm:p-7">
      <div aria-hidden className="absolute inset-0 opacity-90" style={{ background: "radial-gradient(80% 120% at 100% 0%, rgba(232,14,253,.22), transparent 55%), linear-gradient(120deg,#350C85,#4F12C7 60%,#11101E)" }} />
      <div className="relative">
        <p className="font-display text-2xl sm:text-3xl">{hello}</p>
        <p className="mt-1 max-w-xl text-sm text-[#EDE6EC]/85">{line}</p>
        {children}
      </div>
    </header>
  );
}

function HomeBrand({ scenario, go, say }: { scenario: Scenario; go: (t: Tab) => void; say: (m: string) => void }) {
  const steps = scenario.steps!;
  const current = steps.findIndex((s) => s.current);
  const waiting = scenario.revisions!.find((r) => r.status === "aguardando");
  return (
    <>
      <Hero hello={`Olá, ${scenario.person}.`} line="Sua identidade está na etapa de criação. Falta uma aprovação sua para seguirmos.">
        <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Etapas do projeto">
          {steps.map((s, i) => {
            const colors = ["#9a93a8", "#4DA3FF", "#8a6cf0", "#f5c46e", "#22c55e"];
            const color = colors[i] ?? "#8a6cf0";
            return (
              <li key={s.label} className="min-w-0" aria-current={s.current ? "step" : undefined}>
                <span className="block h-1.5 rounded-full" style={{ background: s.done || s.current ? color : "rgba(255,255,255,0.2)", opacity: s.current ? 1 : s.done ? 0.5 : 1 }} />
                <span className={`mt-2 block truncate text-[10px] uppercase sm:tracking-[0.08em] ${i === current ? "font-semibold" : "text-[#EDE6EC]/70"}`} style={i === current ? { color } : undefined}>{s.label}</span>
                <span className="block text-[10px] text-[#EDE6EC]/60">{s.date}</span>
              </li>
            );
          })}
        </ol>
      </Hero>
      {waiting && (
        <Section eyebrow="Sua vez" title={waiting.title}>
          <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr] sm:items-center">
            <LogoArt brand={scenario.companies[0].brand} bg={scenario.companies[0].brand.colors[1].hex} fg={scenario.companies[0].brand.colors[0].hex} big />
            <div className="flex flex-col gap-3">
              <p className="kb-muted text-sm">Ajustamos o peso das letras e simplificamos o símbolo, como você pediu na rodada 1.</p>
              <button type="button" className="kb-btn" onClick={() => say("Aprovação registrada com seu nome e a data.")}>Aprovar esta versão</button>
              <button type="button" className="kb-btn-ghost" onClick={() => go("aprovacoes")}>Pedir ajustes</button>
            </div>
          </div>
        </Section>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickCard title="Brandbook" text="Cores, fontes e logos sempre à mão." onClick={() => go("marca")} />
        <QuickCard title="Histórico" text="3 rodadas de revisão registradas." onClick={() => go("aprovacoes")} />
        <QuickCard title="Arquivos finais" text="Liberados na entrega, por formato." onClick={() => go("arquivos")} />
      </div>
    </>
  );
}

function QuickCard({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="kb-glass group flex min-h-[96px] flex-col items-start justify-between gap-2 p-4 text-left transition-transform active:scale-[.98]">
      <span className="font-display text-lg">{title}</span>
      <span className="kb-muted flex w-full items-center justify-between gap-2 text-sm">{text}<span aria-hidden className="transition-transform group-hover:translate-x-1">→</span></span>
    </button>
  );
}

function HomeRecurring({ scenario, contents, company, go }: { scenario: Scenario; contents: Content[]; company: Company | null; go: (t: Tab) => void }) {
  const count = (s: Content["stage"][]) => contents.filter((c) => s.includes(c.stage)).length;
  const waiting = contents.filter((c) => c.stage === "aprovacao");
  const stats = [
    { label: "Planejados", n: count(["planejado"]) },
    { label: "Em produção", n: count(["producao", "ajustes"]) },
    { label: "Aguardando você", n: waiting.length, hot: true },
    { label: "Publicados", n: count(["publicado", "aprovado"]) },
  ];
  return (
    <>
      <Hero hello={`Olá, ${scenario.person}.`} line={`Outubro de 2026 · ${company?.name ?? "todas as empresas do grupo"}. ${waiting.length ? `${waiting.length} conteúdo${waiting.length > 1 ? "s esperam" : " espera"} sua aprovação.` : "Nada esperando você agora."}`}>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl border px-3 py-3 ${s.hot && s.n ? "border-[#EDE6EC]/50 bg-white/10" : "border-white/15 bg-black/15"}`}>
              <span className="font-display block text-2xl tabular-nums">{s.n}</span>
              <span className="block text-xs text-[#EDE6EC]/80">{s.label}</span>
            </div>
          ))}
        </div>
      </Hero>
      <Section eyebrow="Sua vez" title="Para aprovar" action={<button type="button" className="kb-btn-ghost min-h-11" onClick={() => go("conteudo")}>Ver calendário</button>}>
        {waiting.length === 0 ? <p className="kb-muted text-sm">Tudo aprovado por enquanto. Avisamos no WhatsApp quando chegar algo novo.</p> : (
          <div className="flex flex-col gap-2">
            {waiting.map((c) => (
              <button key={c.id} type="button" className="kb-row w-full text-left" onClick={() => go("conteudo")}>
                <span className="min-w-0"><span className="block truncate text-sm">{c.title}</span><span className="kb-faint block text-xs">{day(c.date)} · {c.format} · {c.channels.length} rede{c.channels.length > 1 ? "s" : ""}</span></span>
                <span className="kb-tag shrink-0">Revisar</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickCard title="Marca das empresas" text="Hotel, Lounge e Praça: logos, cores e fontes." onClick={() => go("marca")} />
        <QuickCard title="Relatório do mês" text="O que saiu, em quais redes e o que falhou." onClick={() => go("relatorio")} />
      </div>
    </>
  );
}

function ContentList({ contents, companies, multi, decide }: { contents: Content[]; companies: Company[]; multi: boolean; decide: (id: string, ok: boolean) => void }) {
  const [filter, setFilter] = useState<"todos" | "aprovacao" | "publicado">("todos");
  const list = contents.filter((c) => filter === "todos" || (filter === "aprovacao" ? c.stage === "aprovacao" : c.stage === "publicado")).sort((a, b) => a.date.localeCompare(b.date));
  const co = (id: string) => companies.find((c) => c.id === id);
  return (
    <Section eyebrow="Outubro de 2026" title="Calendário de conteúdo">
      <div className="kb-seg mb-4" role="group" aria-label="Filtrar">
        {(["todos", "aprovacao", "publicado"] as const).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "todos" ? "Todos" : f === "aprovacao" ? "Para aprovar" : "Publicados"}</button>)}
      </div>
      {list.length === 0 && <p className="kb-muted py-6 text-center text-sm">Nenhum conteúdo neste filtro.</p>}
      <ul className="flex flex-col gap-3">
        {list.map((c) => (
          <li key={c.id} className="kb-card flex flex-col gap-3 !p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="kb-faint flex items-center gap-1.5 text-xs">{multi && <><i aria-hidden className="h-2 w-2 rounded-full" style={{ background: co(c.company)?.color }} />{co(c.company)?.name} ·</>} {day(c.date)} · {c.format}</p>
                <h3 className="mt-1 break-words text-base font-medium">{c.title}</h3>
              </div>
              <span className={`kb-tag ${c.stage === "aprovacao" ? "!border-[#f5c46e]/60 !text-[#f5c46e]" : ""}`}>{STAGE_LABEL[c.stage]}</span>
            </div>
            {c.caption && <p className="kb-muted text-sm">{c.caption}</p>}
            <div className="flex flex-wrap gap-1.5" aria-label="Status por rede">
              {c.channels.map((ch) => (
                <span key={ch.network} className="kb-chip min-h-8 gap-1.5 !text-xs">
                  <i aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_TONE[ch.status] }} />{NETWORK_LABEL[ch.network]} · {CHANNEL_LABEL[ch.status]}
                </span>
              ))}
            </div>
            {c.stage === "aprovacao" && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="kb-btn min-h-11" onClick={() => decide(c.id, true)}>Aprovar</button>
                <button type="button" className="kb-btn-ghost min-h-11" onClick={() => decide(c.id, false)}>Pedir ajustes</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="kb-faint mt-4 text-xs">Um conteúdo é uma entrega só, mesmo saindo em várias redes. Cada rede mostra o próprio status.</p>
    </Section>
  );
}

function LogoArt({ brand, bg, fg, big }: { brand: Brand; bg: string; fg: string; big?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-2xl ${big ? "aspect-[16/10]" : "aspect-[4/3]"}`} style={{ background: bg }}>
      <span className="flex items-center gap-2" style={{ color: fg }}>
        <span className={`flex items-center justify-center rounded-full border-2 font-bold ${big ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm"}`} style={{ borderColor: fg }}>{brand.monogram}</span>
        <span className={`font-semibold tracking-tight ${big ? "text-2xl" : "text-base"}`}>{brand.name.split(" ").slice(0, 2).join(" ")}</span>
      </span>
    </div>
  );
}

function BrandBook({ brand, say, note }: { brand: Brand; say: (m: string) => void; note: string }) {
  const copy = async (hex: string) => {
    try { await navigator.clipboard.writeText(hex); say(`${hex} copiado.`); } catch { say(`Código: ${hex}`); }
  };
  return (
    <>
      {note && <p className="kb-muted text-sm">{note}</p>}
      <Section eyebrow="Brandbook" title={brand.name}>
        <p className="font-display text-lg">“{brand.tagline}”</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[["Propósito", brand.purpose], ["Missão", brand.mission], ["Visão", brand.vision]].map(([k, v]) => (
            <article key={k} className="kb-card !p-4"><p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{k}</p><p className="mt-2 text-sm">{v}</p></article>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Valores">{brand.values.map((v) => <span key={v} className="kb-chip min-h-9">{v}</span>)}</div>
      </Section>
      <Section eyebrow="Cores" title="Paleta" action={<span className="kb-faint text-xs">Toque para copiar o código</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {brand.colors.map((c) => (
            <button key={c.hex} type="button" onClick={() => copy(c.hex)} className="group overflow-hidden rounded-2xl border border-white/10 text-left transition-transform active:scale-[.97]" aria-label={`Copiar ${c.name} ${c.hex}`}>
              <span className="block h-20 transition-transform duration-300 group-hover:scale-[1.04]" style={{ background: c.hex }} />
              <span className="block p-3"><span className="block text-sm font-medium">{c.name}</span><span className="kb-faint block font-mono text-xs">{c.hex}</span><span className="kb-faint mt-1 block text-xs">{c.use}</span></span>
            </button>
          ))}
        </div>
      </Section>
      <Section eyebrow="Tipografia" title="Fontes">
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="kb-card !p-4"><p className="kb-faint text-xs">Títulos · {brand.type.display}</p><p className="mt-2 text-3xl font-semibold" style={{ fontFamily: `${brand.type.display}, serif` }}>Aa Bb Cc 123</p></article>
          <article className="kb-card !p-4"><p className="kb-faint text-xs">Textos · {brand.type.body}</p><p className="mt-2 text-base" style={{ fontFamily: `${brand.type.body}, system-ui` }}>Uma frase de exemplo para ver o corpo de texto em uso.</p></article>
        </div>
        <p className="kb-muted mt-3 text-sm">{brand.type.note}</p>
      </Section>
      <Section eyebrow="Logotipos" title="Versões e downloads">
        <div className="grid gap-3 sm:grid-cols-3">
          {brand.logos.map((l) => (
            <article key={l.name} className="kb-card flex flex-col gap-3 !p-3">
              <LogoArt brand={brand} bg={l.bg} fg={l.fg} />
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">{l.name}</span>
                <span className="flex gap-1">{l.formats.map((f) => <button key={f} type="button" className="kb-chip min-h-9 !text-xs" onClick={() => say(`Download de ${f} (na prévia não baixa nada).`)}>{f}</button>)}</span>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section eyebrow="Na prática" title="Aplicações">
        <div className="kb-scroll-x -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {brand.applications.map((a) => (
            <figure key={a.name} className="w-[200px] shrink-0 sm:w-[240px]">
              <div className="flex aspect-[4/5] items-end rounded-2xl p-3" style={{ background: `linear-gradient(150deg, ${a.tone[0]}, ${a.tone[1]})` }}><span className="rounded-lg bg-black/30 px-2 py-1 text-xs font-semibold text-white">{brand.monogram}</span></div>
              <figcaption className="kb-muted mt-2 text-sm">{a.name}</figcaption>
            </figure>
          ))}
        </div>
      </Section>
    </>
  );
}

function Approvals({ scenario, say }: { scenario: Scenario; say: (m: string) => void }) {
  const [text, setText] = useState("");
  const tone = { aprovada: "Aprovada", ajustes: "Ajustes pedidos", aguardando: "Aguardando você" } as const;
  return (
    <Section eyebrow="Histórico" title="Rodadas de revisão">
      <ol className="relative flex flex-col gap-4 border-l border-white/10 pl-5">
        {scenario.revisions!.map((r) => (
          <li key={r.round} className="relative">
            <span aria-hidden className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-[#11101E] ${r.status === "aprovada" ? "bg-[#2dd4bf]" : r.status === "ajustes" ? "bg-[#ff8a3d]" : "bg-[#f5c46e]"}`} />
            <p className="kb-faint text-xs">{r.round} · {r.date}</p>
            <p className="text-sm font-medium">{r.title}</p>
            <span className="kb-tag mt-1 inline-block">{tone[r.status]}</span>
            {r.note && <blockquote className="kb-card mt-2 !p-3 text-sm">“{r.note}” <span className="kb-faint">— {r.by}</span></blockquote>}
            {r.status === "aguardando" && (
              <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; setText(""); say("Pedido de ajuste registrado na rodada 3."); }}>
                <label className="kb-field"><span>O que precisa mudar?</span><textarea className="kb-control min-h-24 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: deixar o símbolo um pouco maior" /></label>
                <div className="grid grid-cols-2 gap-2"><button type="submit" className="kb-btn-ghost">Pedir ajustes</button><button type="button" className="kb-btn" onClick={() => say("Aprovação registrada com seu nome e a data.")}>Aprovar</button></div>
              </form>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Files({ scenario, say }: { scenario: Scenario; say: (m: string) => void }) {
  return (
    <>
      {scenario.id === "recorrente" && (
        <Section eyebrow="Lume" title="Acervo de fotos e vídeos">
          <label className="kb-field"><span className="sr-only">Buscar no acervo</span><input className="kb-control min-h-12 text-base" placeholder="Busque como fala: “camarão na chapa”, “piscina de dia”…" onKeyDown={(e) => { if (e.key === "Enter") say("No portal real, a busca abre o Lume só na pasta da sua empresa."); }} /></label>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {["#1C5D99", "#FF6A2B", "#E8B93A", "#3BA6FF", "#8C2F0E", "#3A2A0E"].map((c, i) => <div key={i} className="aspect-square rounded-xl" style={{ background: `linear-gradient(135deg, ${c}, #11101E)` }} />)}
          </div>
        </Section>
      )}
      {scenario.files.map((g) => (
        <Section key={g.label} title={g.label}>
          <ul className="flex flex-col">
            {g.items.map((f) => (
              <li key={f.name} className="kb-row">
                <span className="flex min-w-0 items-center gap-3"><span className="kb-tag shrink-0 font-mono">{f.kind}</span><span className="min-w-0"><span className="block truncate text-sm">{f.name}</span><span className="kb-faint block text-xs">{f.size}</span></span></span>
                <button type="button" className="kb-btn-ghost min-h-10 shrink-0" onClick={() => say("Na prévia nada é baixado.")}>Baixar</button>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

function Report({ contents }: { contents: Content[] }) {
  const pubs = contents.flatMap((c) => c.channels);
  const by = (s: ChannelStatus) => pubs.filter((p) => p.status === s).length;
  const networks = Object.entries(pubs.reduce<Record<string, number>>((m, p) => ({ ...m, [p.network]: (m[p.network] ?? 0) + (p.status === "publicado" ? 1 : 0) }), {}));
  const max = Math.max(1, ...networks.map(([, n]) => n));
  return (
    <Section eyebrow="Outubro de 2026" title="Relatório do mês">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Conteúdos", contents.length], ["Publicações", by("publicado")], ["Agendadas", by("agendado")], ["Falharam", by("erro")]].map(([k, v]) => (
          <div key={k} className="kb-card !p-3"><span className="font-display block text-2xl tabular-nums">{v}</span><span className="kb-faint text-xs">{k}</span></div>
        ))}
      </div>
      <h3 className="mt-6 text-sm font-medium">Publicado por rede</h3>
      <div className="mt-3 flex flex-col gap-2">
        {networks.map(([n, v]) => (
          <div key={n} className="grid grid-cols-[88px_1fr_24px] items-center gap-2 text-sm">
            <span className="kb-muted">{NETWORK_LABEL[n as keyof typeof NETWORK_LABEL]}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" style={{ width: `${(v / max) * 100}%` }} /></span>
            <span className="tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <p className="kb-faint mt-4 text-xs">Alcance e engajamento entram quando as redes estiverem conectadas.</p>
    </Section>
  );
}
