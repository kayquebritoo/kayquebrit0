"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { youtubeId } from "@/lib/kbos/lms-client";

type Lesson = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  duracaoMin: number | null;
  dripDays: number;
  videoUrl: string | null;
  conteudo: string | null;
};
type Module = { id: string; titulo: string; aulas: Lesson[] };
type AulaState = {
  id: string;
  desbloqueada: boolean;
  liberaEm: string | null;
  concluida: boolean;
};
type Summary = {
  enrollment: { id: string; status: string };
  total: number;
  concluidas: number;
  pct: number;
  proxima: string | null;
  aulas: AulaState[];
};

function Video({ url, title }: { url: string; title: string }) {
  const yt = youtubeId(url);
  if (yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
    return (
      <video src={url} controls preload="metadata" className="aspect-video w-full rounded-2xl border border-white/10 bg-black" />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.03] px-6 py-10 text-sm uppercase tracking-[0.2em] text-white/80 transition hover:border-white/50 hover:text-white"
    >
      Abrir vídeo em nova aba ↗
    </a>
  );
}

type PlayerData = {
  title: string;
  modules: Module[];
  noAccess?: boolean;
  blocked?: string;
  summary?: Summary;
  cert?: { codigo: string };
};

// Busca fora do componente: o efeito só aplica setStates léxicos (lint).
async function fetchPlayer(courseId: string): Promise<PlayerData> {
  const det = await fetch(`/api/lms/courses/${courseId}`).then((r) => {
    if (!r.ok) throw new Error("Curso não encontrado.");
    return r.json();
  });
  const enrRes = await fetch("/api/lms/enrollments").then((r) => r.json());
  const mine = (enrRes.items || []).find(
    (e: { courseId: string; status: string }) => e.courseId === courseId && e.status !== "cancelada"
  );
  if (!mine) return { title: det.item.titulo, modules: det.modulos || [], noAccess: true };
  if (mine.status === "pendente") {
    return {
      title: det.item.titulo,
      modules: det.modulos || [],
      blocked: "Matrícula aguardando pagamento — conclua o checkout para liberar as aulas.",
    };
  }
  const s = await fetch(`/api/lms/progress?enrollmentId=${mine.id}`).then((r) => {
    if (!r.ok) throw new Error("Falha no progresso.");
    return r.json();
  });
  let cert: { codigo: string } | undefined;
  if (s.enrollment.status === "concluida") {
    const c = await fetch(`/api/lms/certificates?enrollmentId=${mine.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (c?.item) cert = { codigo: c.item.codigo };
  }
  return { title: det.item.titulo, modules: det.modulos || [], summary: s, cert };
}

export default function CoursePlayer({ courseId }: { courseId: string }) {
  const [title, setTitle] = useState("Carregando...");
  const [modules, setModules] = useState<Module[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cert, setCert] = useState<{ codigo: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [noAccess, setNoAccess] = useState(false);

  // Aplica os dados buscando de novo (usado após concluir aula).
  async function load() {
    try {
      const d = await fetchPlayer(courseId);
      setTitle(d.title);
      setModules(d.modules);
      if (d.noAccess) {
        setNoAccess(true);
        return;
      }
      if (d.blocked) {
        setError(d.blocked);
        return;
      }
      if (d.summary) {
        setSummary(d.summary);
        setSelected((prev) => prev ?? d.summary!.proxima ?? d.summary!.aulas?.[0]?.id ?? null);
        if (d.cert) setCert(d.cert);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchPlayer(courseId);
        if (!alive) return;
        setTitle(d.title);
        setModules(d.modules);
        if (d.noAccess) {
          setNoAccess(true);
          return;
        }
        if (d.blocked) {
          setError(d.blocked);
          return;
        }
        if (d.summary) {
          setSummary(d.summary);
          setSelected((prev) => prev ?? d.summary!.proxima ?? d.summary!.aulas?.[0]?.id ?? null);
          if (d.cert) setCert(d.cert);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  async function complete(lessonId: string) {
    if (!summary || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lms/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: summary.enrollment.id, lessonId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  const stateById: Record<string, AulaState> = {};
  for (const a of summary?.aulas || []) stateById[a.id] = a;
  const current = modules.flatMap((m) => m.aulas).find((l) => l.id === selected) ?? null;
  const currentState = current ? stateById[current.id] : null;

  if (error && modules.length === 0 && !noAccess) {
    return <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">{error}</div>;
  }

  if (noAccess) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="font-display text-2xl">{title}</p>
        <p className="mt-2 text-sm font-light text-white/55">Você ainda não está matriculado neste curso.</p>
        <Link href="/portal/cursos" className="mt-6 inline-block rounded-full bg-white px-8 py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black">
          Ver matrícula
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-light md:text-3xl">{title}</h2>
        {summary && (
          <span className="text-sm tabular-nums text-white/60">
            {summary.concluidas}/{summary.total} aulas · {summary.pct}%
          </span>
        )}
      </div>
      {summary && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${summary.pct}%` }} />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-amber-200/90">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {current && (
            <div key={current.id}>
              <h3 className="font-display text-xl">{current.titulo}</h3>
              <p className="mt-1 text-[12px] uppercase tracking-[0.2em] text-white/40">
                {current.tipo}
                {current.duracaoMin ? ` · ${current.duracaoMin} min` : ""}
              </p>
              <div className="mt-4">
                {!currentState || currentState.desbloqueada ? (
                  <>
                    {current.videoUrl && <Video url={current.videoUrl} title={current.titulo} />}
                    {current.descricao && <p className="mt-4 text-[15px] font-light leading-relaxed text-white/70">{current.descricao}</p>}
                    {current.conteudo && (
                      <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-[15px] font-light leading-relaxed text-white/80">
                        {current.conteudo}
                      </div>
                    )}
                    {summary && currentState && !currentState.concluida && (
                      <button
                        onClick={() => complete(current.id)}
                        disabled={saving}
                        className="mt-5 rounded-full bg-white px-8 py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:scale-[1.02] disabled:opacity-60"
                      >
                        {saving ? "Salvando..." : "Marcar como concluída"}
                      </button>
                    )}
                    {currentState?.concluida && (
                      <p className="mt-5 text-sm font-medium text-emerald-300">Concluída ✓</p>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                    <p className="text-3xl" aria-hidden>🔒</p>
                    <p className="mt-3 text-white/75">Aula bloqueada pelo cronograma.</p>
                    {currentState.liberaEm && (
                      <p className="mt-1 text-sm font-light text-white/50">
                        Libera em {new Date(currentState.liberaEm).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {cert && (
            <div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.07] p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-200/80">Certificado emitido</p>
              <p className="font-display mt-1 text-xl tracking-[0.1em]">{cert.codigo}</p>
              <Link href={`/certificado/${cert.codigo}`} className="mt-3 inline-block text-sm text-white underline">
                Ver e validar autenticidade →
              </Link>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {modules.map((m, mi) => (
            <div key={m.id} className="overflow-hidden rounded-2xl border border-white/10">
              <p className="bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.15em] text-white/70">
                {mi + 1}. {m.titulo}
              </p>
              <div>
                {m.aulas.map((l) => {
                  const st = stateById[l.id];
                  const active = l.id === selected;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelected(l.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition ${
                        active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white"
                      }`}
                    >
                      <span aria-hidden className="w-5 shrink-0 text-center">
                        {st?.concluida ? "✓" : st && !st.desbloqueada ? "🔒" : "○"}
                      </span>
                      <span className="flex-1 truncate">{l.titulo}</span>
                      {l.duracaoMin ? <span className="shrink-0 text-[11px] tabular-nums text-white/40">{l.duracaoMin}′</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
