"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Demand, DemandKind, MonthCash } from "@/lib/kbos/today";

type FeedItem = { id: string; at: string; kind: "mensagem" | "orcamento" | "financeiro" | "briefing"; text: string; href: string };
type TodayData = {
  now: string;
  todayKey: string;
  greeting: string;
  name: string | null;
  counts: { late: number; soon: number; proposals: number; unread: number };
  demands: Demand[];
  cash: MonthCash;
  agenda: { id: string; title: string; at: string; location: string | null }[];
  feed: FeedItem[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const KIND_LABEL: Record<DemandKind, string> = {
  cobranca: "Cobrança",
  pagamento: "Pagamento",
  entrega: "Entrega",
  proposta: "Proposta",
};
const MONEY: DemandKind[] = ["cobranca", "pagamento"];

function dueLabel(d: Demand, todayKey: string): string {
  if (d.urgency === "late") return d.daysLate === 1 ? "venceu ontem" : `${d.daysLate} dias de atraso`;
  const diff = Math.round(
    (Date.UTC(+d.dueKey.slice(0, 4), +d.dueKey.slice(5, 7) - 1, +d.dueKey.slice(8, 10)) -
      Date.UTC(+todayKey.slice(0, 4), +todayKey.slice(5, 7) - 1, +todayKey.slice(8, 10))) /
      86_400_000
  );
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === 2) return "em 2 dias";
  return `${d.dueKey.slice(8, 10)}/${d.dueKey.slice(5, 7)}`;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/* Linha do saldo acumulado do mês (curva suave, sem eixos). */
function CashLine({ series }: { series: number[] }) {
  const pts = series.length > 1 ? series : [0, ...series, ...(series.length ? [] : [0])];
  const min = Math.min(0, ...pts);
  const max = Math.max(0, ...pts);
  const span = max - min || 1;
  const W = 640;
  const H = 120;
  const xy = pts.map((v, i) => [(i / Math.max(1, pts.length - 1)) * W, H - 8 - ((v - min) / span) * (H - 24)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg role="img" aria-label="Saldo acumulado ao longo do mês" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[120px] w-full">
      <defs>
        <linearGradient id="kbCashArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(79,18,199,0.4)" />
          <stop offset="100%" stopColor="rgba(79,18,199,0)" />
        </linearGradient>
        <linearGradient id="kbCashLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4F12C7" />
          <stop offset="80%" stopColor="#8A3BF0" />
          <stop offset="100%" stopColor="rgba(232,14,253,0.55)" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#kbCashArea)" />
      <path d={d} fill="none" stroke="url(#kbCashLine)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DemandCard({ d, todayKey }: { d: Demand; todayKey: string }) {
  const money = MONEY.includes(d.kind);
  return (
    <Link href={d.href} className={`kb-card ${d.urgency === "late" ? "late" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="kb-kind">{KIND_LABEL[d.kind]}</span>
        <span className={`kb-tag ${d.urgency === "late" ? "late" : d.urgency === "soon" ? "soon" : ""}`}>{dueLabel(d, todayKey)}</span>
      </span>
      <span className="text-[15px] leading-snug">{d.title}</span>
      {(d.detail || d.amount) && (
        <span className="flex items-center justify-between gap-2">
          <span className="kb-muted truncate text-xs">{d.detail}</span>
          {d.amount ? (
            <span className="text-sm font-semibold whitespace-nowrap">
              {d.kind === "pagamento" ? "− " : ""}
              {brl(d.amount)}
            </span>
          ) : null}
        </span>
      )}
      {d.urgency === "late" && money && d.kind === "cobranca" && <span className="kb-faint text-xs">Toque para cobrar no financeiro</span>}
    </Link>
  );
}

/** Blob → base64 (sem o prefixo data:). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export default function Today() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tudo" | "tarefas" | "dinheiro">("tudo");
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/today", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao carregar.");
      const d = j as TodayData;
      // Itens novos no feed (depois da 1ª carga) entram animados.
      if (seen.current.size) {
        const nf = new Set(d.feed.filter((f) => !seen.current.has(f.id)).map((f) => f.id));
        setFresh(nf);
      }
      d.feed.forEach((f) => seen.current.add(f.id));
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    // "Ao vivo": atualiza a cada 20s enquanto a aba está visível.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        load();
        setClock(Date.now());
      }
    }, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setBusy(true);
      setReply(null);
      try {
        const r = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: t }),
        });
        const j = await r.json();
        setReply(r.ok ? j.reply || "Feito." : j.error || "Não consegui executar agora.");
        if (r.ok) {
          setCmd("");
          load();
        }
      } catch {
        setReply("Sem conexão com o servidor. Tente de novo.");
      } finally {
        setBusy(false);
      }
    },
    [busy, load]
  );

  // Voz: grava de verdade (MediaRecorder) e manda o áudio ao servidor, que
  // transcreve. Funciona no iPhone (inclusive com o app instalado) e no
  // Android — o ditado do navegador (Web Speech) falhava calado no celular.
  const sendAudio = useCallback(
    async (blob: Blob) => {
      setBusy(true);
      setReply(null);
      try {
        const audioBase64 = await blobToBase64(blob);
        const r = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ audioBase64, audioMime: blob.type || "audio/webm" }),
        });
        const j = await r.json();
        if (!r.ok) setReply(j.error || "Não consegui processar o áudio.");
        else if (j.transcriptStub) setReply("Áudio recebido, mas a transcrição está desligada: falta a OPENAI_API_KEY na VPS.");
        else {
          if (j.transcript) setCmd(j.transcript);
          setReply(j.reply || "Feito.");
          load();
        }
      } catch {
        setReply("Sem conexão com o servidor. Tente de novo.");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const toggleMic = async () => {
    if (recording) {
      mediaRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setReply("Este navegador não grava áudio. Digite o comando ou mande um áudio no WhatsApp.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        if (blob.size > 1500) sendAudio(blob);
        else setReply("Áudio muito curto. Toque, fale e toque de novo para enviar.");
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setReply("Gravando… toque no microfone de novo para enviar.");
      setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 60_000);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setReply(
        name === "NotAllowedError"
          ? "O microfone está bloqueado. Libere o acesso ao microfone para o KBOS nas configurações do navegador."
          : "Não consegui acessar o microfone."
      );
    }
  };

  const demands = useMemo(() => {
    const all = data?.demands ?? [];
    if (filter === "dinheiro") return all.filter((d) => MONEY.includes(d.kind));
    if (filter === "tarefas") return all.filter((d) => !MONEY.includes(d.kind));
    return all;
  }, [data, filter]);

  if (error && !data) {
    return (
      <div className="kb-glass p-6">
        <p className="font-semibold">Não deu para carregar a tela Hoje.</p>
        <p className="kb-muted mt-1 text-sm">{error}</p>
        <button type="button" onClick={load} className="kb-chip mt-4">Tentar de novo</button>
      </div>
    );
  }

  const dateLabel = data
    ? new Date(data.now).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
    : "";
  const cols: { key: Demand["urgency"]; label: string; empty: string }[] = [
    { key: "late", label: "Atrasado", empty: "Nada atrasado. Segue assim." },
    { key: "soon", label: "Vence em 48h", empty: "Nada vencendo nos próximos 2 dias." },
    { key: "upcoming", label: "Próximos dias", empty: "Semana livre por enquanto." },
  ];

  return (
    <div className="relative flex flex-col gap-5">
      {/* waveforms da marca, ondulando devagar */}
      <svg aria-hidden className="kb-wave pointer-events-none absolute -top-24 left-0 -z-10 h-[300px] w-[calc(100%+40px)]" viewBox="0 0 1440 300" preserveAspectRatio="none" fill="none">
        {[60, 100, 140, 180, 220].map((y, i) => (
          <path key={y} d={`M0 ${y} C 260 ${y - 30}, 460 ${y + 40}, ${740 + i * 30} ${y + 4} S 1220 ${y - 30}, 1440 ${y + 14}`} stroke="var(--kb-wave)" strokeWidth="1" />
        ))}
      </svg>

      {/* ── Saudação + alertas ── */}
      <section className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kb-muted text-sm first-letter:uppercase">{dateLabel}</p>
          <h2 className="font-display mt-1 text-[38px] font-light leading-[1.05] sm:text-[48px]">
            {data ? `${data.greeting}${data.name ? `, ${data.name}` : ""}` : " "}
          </h2>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {data.counts.late > 0 && (
              <a href="#demandas" className="kb-tag late">
                <span aria-hidden className="kb-dot-late kb-pulse" />
                {data.counts.late} atrasado{data.counts.late > 1 ? "s" : ""}
              </a>
            )}
            {data.counts.soon > 0 && (
              <a href="#demandas" className="kb-tag soon">
                {data.counts.soon} vence{data.counts.soon > 1 ? "m" : ""} em 48h
              </a>
            )}
            {data.counts.proposals > 0 && (
              <Link href="/admin/orcamentos" className="kb-tag">
                {data.counts.proposals} proposta{data.counts.proposals > 1 ? "s" : ""} em aberto
              </Link>
            )}
            {data.counts.unread > 0 && (
              <Link href="/admin/inbox" className="kb-tag">
                {data.counts.unread} mensage{data.counts.unread > 1 ? "ns" : "m"} não lida{data.counts.unread > 1 ? "s" : ""}
              </Link>
            )}
            {data.counts.late + data.counts.soon === 0 && <span className="kb-tag">Tudo em dia</span>}
          </div>
        )}
      </section>

      {/* ── Assistente: fale ou digite ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(cmd);
        }}
        className="kb-glass flex items-center gap-3 rounded-full! py-2 pl-5 pr-2 shadow-[0_0_0_1px_var(--kb-accent-line),0_24px_70px_-30px_rgba(79,18,199,0.75)]"
      >
        <label htmlFor="kb-cmd" className="sr-only">
          Fale ou digite um comando para o assistente
        </label>
        <input
          id="kb-cmd"
          className="kb-input"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="Ex.: criar orçamento site para Maria: página 3000"
          enterKeyHint="send"
          autoComplete="off"
          disabled={busy}
        />
        <button
          type="button"
          onClick={toggleMic}
          data-on={recording}
          aria-label={recording ? "Parar e enviar o áudio" : "Gravar um comando de voz"}
          className="kb-mic"
        >
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      </form>
      {(busy || reply) && (
        <p role="status" className="kb-arrive kb-muted -mt-2 px-4 text-sm">
          {busy ? "Executando…" : reply}
        </p>
      )}

      <div className="kb-scroll-x -mx-4 -mt-1 scroll-px-4 px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <Link href="/admin/financeiro" className="kb-chip">Nova despesa</Link>
        <Link href="/admin/financeiro" className="kb-chip">Nova entrada</Link>
        <Link href="/admin/orcamentos" className="kb-chip">Novo orçamento</Link>
        <Link href="/admin/agenda" className="kb-chip">Agenda</Link>
        <Link href="/admin/inbox" className="kb-chip">Inbox</Link>
      </div>

      {/* ── Demandas por prazo ── */}
      <section id="demandas" aria-labelledby="kb-dem" className="kb-glass flex scroll-mt-24 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="kb-dem" className="text-base font-semibold">Demandas por prazo</h2>
          <div role="group" aria-label="Filtrar demandas" className="flex gap-2">
            {(["tudo", "tarefas", "dinheiro"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="kb-chip capitalize">
                {f}
              </button>
            ))}
          </div>
        </div>
        {!data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="kb-card h-28 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="kb-scroll-x -mx-5 scroll-px-5 px-5 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {cols.map((c) => {
              const items = demands.filter((d) => d.urgency === c.key);
              return (
                <div key={c.key} className="flex w-[82vw] max-w-[360px] shrink-0 flex-col gap-2.5 sm:w-auto sm:max-w-none">
                  <h3
                    className={`flex items-center gap-2 text-[13px] font-semibold ${
                      c.key === "late" ? "text-[var(--kb-late)]" : c.key === "soon" ? "text-[var(--kb-soon)]" : "kb-muted"
                    }`}
                  >
                    {c.key === "late" && items.length > 0 && <span aria-hidden className="kb-dot-late kb-pulse" />}
                    {c.label} · {items.length}
                  </h3>
                  {items.length === 0 ? (
                    <p className="kb-faint rounded-[14px] border border-dashed border-[var(--kb-line-strong)] p-4 text-sm">{c.empty}</p>
                  ) : (
                    items.map((d) => <DemandCard key={d.id} d={d} todayKey={data.todayKey} />)
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[7fr_5fr]">
        {/* ── Caixa do mês ── */}
        <section aria-labelledby="kb-caixa" className="kb-glass flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="kb-caixa" className="text-base font-semibold">
              Caixa de {data ? new Date(data.now).toLocaleDateString("pt-BR", { month: "long" }) : "…"}
            </h2>
            <Link href="/admin/financeiro" className="kb-chip">Abrir</Link>
          </div>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="kb-muted text-[13px]">Saldo pago no mês</p>
              <p className="font-display mt-1 text-[40px] font-light leading-none">{data ? brl(data.cash.balance) : "—"}</p>
            </div>
            <div className="flex gap-7 pb-1">
              <div>
                <p className="kb-muted text-[13px]">Entrou</p>
                <p className="mt-0.5 text-lg font-semibold">{data ? brl(data.cash.income) : "—"}</p>
              </div>
              <div>
                <p className="kb-muted text-[13px]">Saiu</p>
                <p className="mt-0.5 text-lg font-semibold">{data ? brl(data.cash.expense) : "—"}</p>
              </div>
            </div>
          </div>
          {data && <CashLine series={data.cash.series} />}
          <p className="kb-faint text-xs">Separação pessoal × empresa chega na próxima etapa do financeiro.</p>
        </section>

        {/* ── Ao vivo + agenda ── */}
        <div className="flex flex-col gap-5">
          <section aria-labelledby="kb-vivo" className="kb-glass flex flex-col gap-1 p-5 sm:p-6">
            <div className="mb-2 flex items-center gap-2.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--kb-ink)] shadow-[0_0_0_5px_var(--kb-accent-soft)]" />
              <h2 id="kb-vivo" className="text-base font-semibold">Ao vivo</h2>
              <span className="kb-faint ml-auto text-xs">atualiza sozinho</span>
            </div>
            {!data ? (
              <div className="kb-card h-16 animate-pulse" />
            ) : data.feed.length === 0 ? (
              <p className="kb-muted text-sm">Quando chegar mensagem, pagamento ou briefing, aparece aqui na hora.</p>
            ) : (
              <ul className="flex flex-col">
                {data.feed.map((f, i) => (
                  <li key={f.id} className={fresh.has(f.id) ? "kb-arrive" : ""}>
                    <Link href={f.href} className={`flex gap-3 py-3 ${i ? "border-t border-[var(--kb-line)]" : ""}`}>
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--kb-chip)]">
                        <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path
                            d={
                              f.kind === "mensagem"
                                ? "M4 5h16v11H8l-4 4z"
                                : f.kind === "financeiro"
                                  ? "M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"
                                  : f.kind === "briefing"
                                    ? "M12 5v14M5 12h14"
                                    : "M6 3h9l3 3v15H6zM9 12h6M9 16h6"
                            }
                          />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug">{f.text}</span>
                        <span className="kb-faint mt-0.5 block text-xs">{ago(f.at, clock)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="kb-agenda" className="kb-glass p-5 sm:p-6">
            <h2 id="kb-agenda" className="mb-1 text-base font-semibold">Agenda de hoje</h2>
            {data && data.agenda.length === 0 ? (
              <p className="kb-muted text-sm">
                Nenhum compromisso hoje. <Link href="/admin/agenda" className="underline underline-offset-4">Marcar um</Link>
              </p>
            ) : (
              data?.agenda.map((e) => (
                <div key={e.id} className="kb-row">
                  <span className="text-sm">{e.title}</span>
                  <span className="kb-muted text-sm">
                    {new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
