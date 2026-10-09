"use client";
import { useEffect, useState } from "react";

type Module = { id: string; titulo: string; ordem: number };
type Lesson = {
  id: string;
  moduleId: string;
  titulo: string;
  tipo: string;
  videoUrl: string | null;
  duracaoMin: number | null;
  ordem: number;
  dripDays: number;
};
type Enrollment = {
  id: string;
  status: string;
  progressoPct: string;
  aluno: { name: string; email: string } | null;
};

const TIPOS = ["video", "texto", "quiz", "arquivo"];

type DetailData = {
  title: string;
  course: { titulo: string; descricao: string; preco: string; capa: string; status: string };
  modules: (Module & { aulas: Lesson[] })[];
  enrollments: Enrollment[];
};

// Busca fora do componente: o efeito só aplica setStates léxicos (lint).
async function fetchCourseDetail(courseId: string): Promise<DetailData> {
  const det = await fetch(`/api/lms/courses/${courseId}`).then((r) => {
    if (!r.ok) throw new Error("Curso não encontrado.");
    return r.json();
  });
  const enr = await fetch(`/api/lms/enrollments?courseId=${courseId}`).then((r) =>
    r.ok ? r.json() : { items: [] }
  );
  return {
    title: det.item.titulo,
    course: {
      titulo: det.item.titulo,
      descricao: det.item.descricao || "",
      preco: det.item.preco || "",
      capa: det.item.capa || "",
      status: det.item.status,
    },
    modules: (det.modulos || []).map((m: Module & { aulas: Lesson[] }) => ({
      id: m.id,
      titulo: m.titulo,
      ordem: (m as { ordem?: number }).ordem ?? 0,
      aulas: m.aulas || [],
    })),
    enrollments: enr.items || [],
  };
}

export default function AdminCourseDetail({ courseId }: { courseId: string }) {
  const [title, setTitle] = useState("Carregando...");
  const [course, setCourse] = useState({ titulo: "", descricao: "", preco: "", capa: "", status: "rascunho" });
  const [modules, setModules] = useState<(Module & { aulas: Lesson[] })[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [newModule, setNewModule] = useState("");
  const [newLesson, setNewLesson] = useState<Record<string, { titulo: string; tipo: string; videoUrl: string; dripDays: string }>>({});

  async function load() {
    try {
      const d = await fetchCourseDetail(courseId);
      setTitle(d.title);
      setCourse(d.course);
      setModules(d.modules);
      setEnrollments(d.enrollments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetchCourseDetail(courseId);
        if (!alive) return;
        setTitle(d.title);
        setCourse(d.course);
        setModules(d.modules);
        setEnrollments(d.enrollments);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Erro.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      const res = await fetch(`/api/lms/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: course.titulo,
          descricao: course.descricao || null,
          preco: course.preco || null,
          capa: course.capa || null,
          status: course.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha.");
      setOk("Curso atualizado.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    if (!newModule.trim()) return;
    const res = await fetch("/api/lms/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, titulo: newModule.trim() }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.details?.[0]?.mensagem || data.error || "Falha.");
      return;
    }
    setNewModule("");
    load();
  }

  async function addLesson(moduleId: string) {
    const f = newLesson[moduleId];
    if (!f?.titulo.trim()) return;
    const res = await fetch("/api/lms/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moduleId,
        titulo: f.titulo.trim(),
        tipo: f.tipo || "video",
        videoUrl: f.videoUrl || undefined,
        dripDays: f.dripDays ? Number(f.dripDays) : 0,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.details?.[0]?.mensagem || data.error || "Falha.");
      return;
    }
    setNewLesson({ ...newLesson, [moduleId]: { titulo: "", tipo: "video", videoUrl: "", dripDays: "" } });
    load();
  }

  const blank = { titulo: "", tipo: "video", videoUrl: "", dripDays: "" };
  const setF = (moduleId: string, k: string, v: string) =>
    setNewLesson({ ...newLesson, [moduleId]: { ...blank, ...newLesson[moduleId], [k]: v } });

  return (
    <div>
      <h2 className="font-display text-xl font-light">{title}</h2>
      {error && (
        <div className="mb-4 mt-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>
      )}
      {ok && (
        <div className="mb-4 mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 text-sm text-emerald-100">{ok}</div>
      )}

      <form onSubmit={save} className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12">
        <input value={course.titulo} onChange={(e) => setCourse({ ...course, titulo: e.target.value })} required placeholder="Título" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-3" />
        <input value={course.preco} onChange={(e) => setCourse({ ...course, preco: e.target.value })} placeholder="Preço R$" inputMode="decimal" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2" />
        <input value={course.descricao} onChange={(e) => setCourse({ ...course, descricao: e.target.value })} placeholder="Descrição" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-3" />
        <input value={course.capa} onChange={(e) => setCourse({ ...course, capa: e.target.value })} placeholder="URL da capa" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-2" />
        <select value={course.status} onChange={(e) => setCourse({ ...course, status: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none">
          {["rascunho", "publicado", "arquivado"].map((s) => (
            <option key={s} value={s} className="bg-[#12122a]">{s}</option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black md:col-span-1">Salvar</button>
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-white/40">Módulos e aulas</p>
          <form onSubmit={addModule} className="flex gap-2">
            <input value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="Novo módulo..." className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
            <button type="submit" className="rounded-xl border border-white/25 px-5 text-[12px] font-bold uppercase tracking-[0.15em] hover:bg-white hover:text-black">+</button>
          </form>
          <div className="mt-4 space-y-4">
            {modules.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-2xl border border-white/10">
                <p className="bg-white/[0.04] px-4 py-2.5 text-sm font-semibold">{m.titulo}</p>
                <div className="divide-y divide-white/5">
                  {m.aulas.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-white/60">{l.tipo}</span>
                      <span className="flex-1 truncate text-white/85">{l.titulo}</span>
                      {l.dripDays > 0 && <span className="text-[11px] text-amber-200/80">drip {l.dripDays}d</span>}
                      {l.duracaoMin ? <span className="text-[11px] tabular-nums text-white/40">{l.duracaoMin}′</span> : null}
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 border-t border-white/10 bg-black/20 p-3 md:grid-cols-12">
                  <input value={newLesson[m.id]?.titulo || ""} onChange={(e) => setF(m.id, "titulo", e.target.value)} placeholder="Nova aula..." className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-4" />
                  <select value={newLesson[m.id]?.tipo || "video"} onChange={(e) => setF(m.id, "tipo", e.target.value)} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[13px] outline-none md:col-span-2">
                    {TIPOS.map((t) => (
                      <option key={t} value={t} className="bg-[#12122a]">{t}</option>
                    ))}
                  </select>
                  <input value={newLesson[m.id]?.videoUrl || ""} onChange={(e) => setF(m.id, "videoUrl", e.target.value)} placeholder="URL do vídeo" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-4" />
                  <input value={newLesson[m.id]?.dripDays || ""} onChange={(e) => setF(m.id, "dripDays", e.target.value)} placeholder="Drip (dias)" inputMode="numeric" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-white/50 md:col-span-1" />
                  <button type="button" onClick={() => addLesson(m.id)} className="rounded-lg border border-white/25 px-3 py-2 text-[12px] font-bold uppercase hover:bg-white hover:text-black md:col-span-1">+</button>
                </div>
              </div>
            ))}
            {modules.length === 0 && <p className="text-sm font-light text-white/40">Nenhum módulo ainda.</p>}
          </div>
        </div>

        <aside>
          <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-white/40">
            Matrículas ({enrollments.length})
          </p>
          <div className="space-y-2">
            {enrollments.map((e) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <p className="truncate text-sm font-medium">{e.aluno?.name ?? "—"}</p>
                <p className="truncate text-[12px] font-light text-white/45">{e.aluno?.email ?? ""}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.15em]">
                  <span className="text-white/60">{e.status}</span>
                  <span className="tabular-nums text-white/60">{Number(e.progressoPct || 0)}%</span>
                </div>
              </div>
            ))}
            {enrollments.length === 0 && <p className="text-sm font-light text-white/40">Nenhuma matrícula.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
