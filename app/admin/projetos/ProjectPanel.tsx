"use client";
import { useCallback, useEffect, useState } from "react";

type Task = { id: string; titulo: string; status: string; responsavelRole: string | null };
type FileItem = { id: string; nome: string; url: string; status: string };

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}min`;
}

export default function ProjectPanel({ project, onClose }: { project: { id: string; titulo: string }; onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");

  const load = useCallback(async () => {
    const [t, f, tm] = await Promise.all([
      fetch(`/api/tasks?projectId=${project.id}`).then((r) => r.json()),
      fetch(`/api/projects/${project.id}/files`).then((r) => r.json()),
      fetch(`/api/time?projectId=${project.id}`).then((r) => r.json()),
    ]);
    setTasks(t.items || []);
    setFiles(f.items || []);
    setTotal(tm.totalSegundos || 0);
    setOpen(!!tm.aberta);
  }, [project.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, f, tm] = await Promise.all([
        fetch(`/api/tasks?projectId=${project.id}`).then((r) => r.json()),
        fetch(`/api/projects/${project.id}/files`).then((r) => r.json()),
        fetch(`/api/time?projectId=${project.id}`).then((r) => r.json()),
      ]);
      if (!alive) return;
      setTasks(t.items || []);
      setFiles(f.items || []);
      setTotal(tm.totalSegundos || 0);
      setOpen(!!tm.aberta);
    })();
    return () => {
      alive = false;
    };
  }, [project.id]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, titulo: title }),
    });
    setTitle("");
    load();
  }

  async function toggleTask(t: Task) {
    const next = t.status === "done" ? "todo" : t.status === "todo" ? "doing" : "done";
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function timer(action: "start" | "stop") {
    await fetch("/api/time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, projectId: project.id }),
    });
    load();
  }

  async function addFile(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;
    await fetch(`/api/projects/${project.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: fileName, url: fileUrl, kind: "aprovacao" }),
    });
    setFileName("");
    setFileUrl("");
    load();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-[#0e0e22] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl">{project.titulo}</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-2xl leading-none text-white/60 hover:text-white">×</button>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] uppercase tracking-[0.2em] text-white/50">Tempo total · {fmt(total)}</p>
            <button
              onClick={() => timer(open ? "stop" : "start")}
              className={`rounded-full px-5 py-2 text-[12px] font-bold uppercase tracking-[0.15em] ${open ? "bg-rose-400 text-black" : "bg-emerald-400 text-black"}`}
            >
              {open ? "■ Parar" : "▶ Iniciar"}
            </button>
          </div>
          {open && <p className="mt-2 text-[12px] text-emerald-300">Timer rodando...</p>}
        </div>

        <p className="mt-6 text-[12px] uppercase tracking-[0.2em] text-white/50">Tarefas</p>
        <form onSubmit={addTask} className="mt-2 flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa..." className="flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
          <button type="submit" className="rounded-xl bg-white px-4 text-[12px] font-bold uppercase text-black">+</button>
        </form>
        <div className="mt-3 space-y-2">
          {tasks.map((t) => (
            <button key={t.id} onClick={() => toggleTask(t)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-left text-sm">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${t.status === "done" ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/30 text-transparent"}`}>✓</span>
              <span className={t.status === "done" ? "text-white/40 line-through" : ""}>{t.titulo}</span>
              <span className="ml-auto text-[10px] uppercase tracking-[0.15em] text-white/35">{t.status === "todo" ? "a fazer" : t.status === "doing" ? "fazendo" : "feita"}</span>
            </button>
          ))}
          {tasks.length === 0 && <p className="text-sm font-light text-white/35">Sem tarefas ainda.</p>}
        </div>

        <p className="mt-6 text-[12px] uppercase tracking-[0.2em] text-white/50">Arquivos p/ aprovação</p>
        <form onSubmit={addFile} className="mt-2 flex flex-col gap-2">
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Nome do arquivo" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
          <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="URL (Drive, frame...)" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
          <button type="submit" className="rounded-xl border border-white/25 py-2.5 text-[12px] uppercase tracking-[0.15em] hover:bg-white hover:text-black">Enviar p/ aprovação</button>
        </form>
        <div className="mt-3 space-y-2 pb-6">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/30 px-4 py-2.5 text-sm">
              <span className="truncate text-white/80">{f.nome}</span>
              <span className="shrink-0 text-[11px] uppercase tracking-[0.15em] text-white/45">{f.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
