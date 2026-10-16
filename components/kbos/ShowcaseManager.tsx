"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Project = {
  id: string;
  titulo: string;
  categoria: string;
  status: string;
  slug: string | null;
  description: string | null;
  coverUrl: string | null;
  thumbUrl: string | null;
  videoUrl: string | null;
  courseId: string | null;
};
type Course = { id: string; titulo: string; slug: string };

const input =
  "rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50";

// Vitrine: edita slug/descrição/mídias de um projeto e associa um curso.
// Usado abaixo do Kanban operacional em `/admin/projetos`.
export default function ShowcaseManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ slug: "", description: "", coverUrl: "", thumbUrl: "", videoUrl: "", courseId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        fetch("/api/projects").then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Falha.");
          return (j.items || []) as Project[];
        }),
        fetch("/api/courses").then(async (r) => {
          const j = await r.json();
          if (!r.ok) return [] as Course[];
          return (j.items || []) as Course[];
        }),
      ]);
      setProjects(p);
      setCourses(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    load();
  }, [load]);

  function open(p: Project) {
    setEditing(p);
    setForm({
      slug: p.slug || "",
      description: p.description || "",
      coverUrl: p.coverUrl || "",
      thumbUrl: p.thumbUrl || "",
      videoUrl: p.videoUrl || "",
      courseId: p.courseId || "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        slug: form.slug.trim().toLowerCase() || null,
        description: form.description.trim() || null,
        coverUrl: form.coverUrl.trim() || null,
        thumbUrl: form.thumbUrl.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
        courseId: form.courseId || null,
      };
      const res = await fetch(`/api/projects/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha ao salvar.");
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-light">Vitrine & curso associado</h2>
          <p className="mt-1 text-[13px] text-white/50">Capa, thumb, vídeo e o curso que este projeto oferece. Tudo opcional.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-white/15 px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-white/65 transition hover:bg-white/10 hover:text-white">
          Recarregar
        </button>
      </div>
      {error && <div className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {projects.map((p) => {
          const course = courses.find((c) => c.id === p.courseId);
          return (
            <button
              key={p.id}
              onClick={() => open(p)}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] text-left transition hover:border-white/30 active:scale-[0.99]"
            >
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt="" className="h-32 w-full object-cover opacity-90 transition group-hover:opacity-100" loading="lazy" />
              ) : (
                <div className="flex h-32 items-center justify-center bg-black/30 text-[11px] uppercase tracking-[0.25em] text-white/30">
                  sem capa
                </div>
              )}
              <div className="p-4">
                <p className="font-medium leading-snug">{p.titulo}</p>
                <p className="mt-1 font-mono text-[11px] text-white/35">/{p.slug || "sem-slug"} · {p.categoria}</p>
                <p className="mt-2 text-[12px] text-white/55">
                  {course ? `▸ Curso: ${course.titulo}` : "▸ Nenhum curso associado"}
                  {p.videoUrl ? " · ▶ vídeo" : ""}
                </p>
              </div>
            </button>
          );
        })}
        {projects.length === 0 && <p className="text-sm text-white/40">Nenhum projeto ainda — crie um no Kanban acima.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg animate-[kbosUp_0.25s_ease] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#1a1828] p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display truncate text-lg">{editing.titulo}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Fechar" className="rounded-lg px-2 text-2xl leading-none text-white/60 hover:text-white">×</button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                Slug (URL)
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="meu-projeto" className={input} />
              </label>
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                Descrição
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Resumo para a vitrine..." className={input} />
              </label>
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                URL da capa
                <input value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} placeholder="https://..." inputMode="url" className={input} />
              </label>
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                URL do thumb
                <input value={form.thumbUrl} onChange={(e) => setForm({ ...form, thumbUrl: e.target.value })} placeholder="https://..." inputMode="url" className={input} />
              </label>
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                URL do vídeo
                <input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtube... / mp4" inputMode="url" className={input} />
              </label>
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                Curso associado
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={input}>
                  <option value="" className="bg-[#1a1828]">Nenhum curso</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#1a1828]">{c.titulo} · /{c.slug}</option>
                  ))}
                </select>
              </label>
              {courses.length === 0 && (
                <p className="text-[12px] text-white/40">
                  Nenhum curso cadastrado. <Link href="/admin/cursos" className="underline hover:text-white">Criar curso →</Link>
                </p>
              )}
            </div>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar vitrine"}
            </button>
          </form>
          <style>{`@keyframes kbosUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
    </section>
  );
}
