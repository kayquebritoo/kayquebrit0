"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Enrollment = {
  id: string;
  courseId: string;
  status: string;
  progressoPct: string;
};
type Course = { id: string; titulo: string; descricao: string | null; preco: string | null; status: string };
type Progress = { pct: number; total: number; concluidas: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  pendente: "Aguardando pagamento",
  ativa: "Ativa",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

// Busca fora do componente: o efeito só aplica setStates léxicos (lint).
async function fetchStudentData() {
  const [enrRes, catRes] = await Promise.all([fetch("/api/lms/enrollments"), fetch("/api/lms/courses")]);
  const enrData = await enrRes.json();
  if (!enrRes.ok) throw new Error(enrData.error || "Falha.");
  const catData = catRes.ok ? await catRes.json() : { items: [] };
  const map: Record<string, Course> = {};
  for (const c of catData.items || []) map[c.id] = c;
  // cursos de matrículas antigas/arquivadas podem sair do catálogo
  for (const e of enrData.items || []) {
    if (!map[e.courseId]) {
      const d = await fetch(`/api/lms/courses/${e.courseId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (d?.item) map[e.courseId] = d.item;
    }
  }
  const prog: Record<string, Progress> = {};
  await Promise.all(
    (enrData.items || []).map(async (e: Enrollment) => {
      const p = await fetch(`/api/lms/progress?enrollmentId=${e.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (p) prog[e.id] = { pct: p.pct, total: p.total, concluidas: p.concluidas };
    })
  );
  return {
    map,
    catalog: ((catData.items || []) as Course[]).filter((c) => c.status === "publicado"),
    items: (enrData.items || []) as Enrollment[],
    prog,
  };
}

export default function StudentCourses() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courses, setCourses] = useState<Record<string, Course>>({});
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [catalog, setCatalog] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState<string | null>(null);
  const [notice] = useState(() => {
    if (typeof window === "undefined") return "";
    const pag = new URLSearchParams(window.location.search).get("pagamento");
    if (pag === "aprovado") return "Pagamento aprovado! Sua matrícula será ativada em instantes — recarregue se precisar.";
    if (pag === "recusado") return "Pagamento não concluído. Tente novamente quando quiser.";
    if (pag === "pendente") return "Pagamento em análise. Avisaremos assim que confirmar.";
    return "";
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchStudentData();
        if (!alive) return;
        setCourses(d.map);
        setCatalog(d.catalog);
        setEnrollments(d.items);
        setProgress(d.prog);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);


  async function buy(courseId: string) {
    setBuying(courseId);
    setError("");
    try {
      const res = await fetch("/api/lms/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no checkout.");
      window.location.assign(data.init_point);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
      setBuying(null);
    }
  }

  if (error && enrollments.length === 0 && catalog.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        {error}
      </div>
    );
  }

  const enrolledIds = new Set(enrollments.filter((e) => e.status !== "cancelada").map((e) => e.courseId));
  const toBuy = catalog.filter((c) => !enrolledIds.has(c.id));

  return (
    <div>
      {notice && (
        <div className="mb-6 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/85">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">Meus cursos</p>
      {enrollments.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-white/70">Você ainda não está matriculado em nenhum curso.</p>
          <p className="mt-2 text-sm font-light text-white/45">Escolha abaixo e comece hoje.</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {enrollments.map((e) => {
            const c = courses[e.courseId];
            const p = progress[e.id];
            const pct = p?.pct ?? Number(e.progressoPct || 0);
            return (
              <article key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl">{c?.titulo ?? "Curso"}</h2>
                  <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/75">
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px] text-white/55">
                    <span>Progresso</span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {e.status === "pendente" ? (
                    <span className="text-sm font-light text-amber-200/90">Conclua o pagamento para liberar as aulas.</span>
                  ) : (
                    <Link
                      href={`/portal/cursos/${e.courseId}`}
                      className="rounded-full bg-white px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:scale-[1.02]"
                    >
                      {pct > 0 ? "Continuar" : "Começar"}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {toBuy.length > 0 && (
        <>
          <p className="mb-3 mt-10 text-[11px] uppercase tracking-[0.25em] text-white/40">Catálogo</p>
          <div className="grid gap-4 md:grid-cols-2">
            {toBuy.map((c) => (
              <article key={c.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <h2 className="font-display text-xl">{c.titulo}</h2>
                {c.descricao && <p className="mt-2 line-clamp-2 text-sm font-light text-white/55">{c.descricao}</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="font-display text-2xl">{c.preco ? brl(Number(c.preco)) : "—"}</span>
                  <button
                    onClick={() => buy(c.id)}
                    disabled={buying === c.id}
                    className="rounded-full border border-white/25 px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white hover:text-black disabled:opacity-60"
                  >
                    {buying === c.id ? "Gerando..." : "Matricular"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
