"use client";
import { useCallback, useEffect, useState } from "react";
import { PIPELINE } from "@/lib/kbos/constants";

export type PanelProject = {
  id: string;
  titulo: string;
  categoria: string;
  status: string;
  valor: string | null;
  prazo: string | null;
  description?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactCompany?: string | null;
  clienteId?: string | null;
  tasksTotal?: number;
  tasksDone?: number;
};
type Contact = { id: string; name: string; company: string | null };
type Task = { id: string; titulo: string; status: string; dueAt: string | null };
type FileItem = { id: string; nome: string; url: string; status: string };

const fmt = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}min`;
const NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };
const LABEL: Record<string, string> = { todo: "a fazer", doing: "fazendo", done: "feita" };
const asDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const CATS: [string, string][] = [["fotografia", "Fotografia"], ["video", "Vídeo"], ["sites", "Sites"], ["apps", "Apps"], ["lojas", "Lojas"], ["design", "Design"]];

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Não consegui concluir.");
  return j;
}

export default function ProjectPanel({ project, contacts, onClose, onChanged, onMoved }: {
  project: PanelProject; contacts: Contact[]; onClose: () => void; onChanged: () => void | Promise<void>; onMoved: (id: string, status: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [title, setTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({
    titulo: project.titulo, categoria: project.categoria, contactId: project.contactId ?? "", valor: project.valor ?? "",
    prazo: asDate(project.prazo), description: project.description ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((s) => ({ ...s, [k]: v })); setDirty(true); };

  const load = useCallback(async () => {
    try {
      const [t, fl, tm] = await Promise.all([
        call(`/api/tasks?projectId=${project.id}`, "GET"),
        call(`/api/projects/${project.id}/files`, "GET"),
        call(`/api/time?projectId=${project.id}`, "GET"),
      ]);
      setTasks(t.items || []);
      setFiles(fl.items || []);
      setTotal(tm.totalSegundos || 0);
      setRunning(!!tm.aberta);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui carregar os detalhes.");
    }
  }, [project.id]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg("");
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await call(`/api/projects/${project.id}`, "PATCH", {
        titulo: f.titulo, categoria: f.categoria, contactId: f.contactId || null,
        valor: f.valor.trim() ? f.valor.trim() : null, prazo: f.prazo || null, description: f.description.trim() || null,
      });
      setDirty(false);
      await onChanged();
    }, "Salvo.");
  };
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    return run(async () => {
      await call("/api/tasks", "POST", { projectId: project.id, titulo: title.trim(), ...(taskDue ? { dueAt: new Date(`${taskDue}T12:00:00`).toISOString() } : {}) });
      setTitle(""); setTaskDue(""); await load(); await onChanged();
    });
  };
  const cycle = (t: Task) => run(async () => { await call(`/api/tasks/${t.id}`, "PATCH", { status: NEXT[t.status] ?? "todo" }); await load(); await onChanged(); });
  const delTask = (t: Task) => run(async () => { await call(`/api/tasks/${t.id}`, "DELETE"); await load(); await onChanged(); });
  const timer = (action: "start" | "stop") => run(async () => { await call("/api/time", "POST", { action, projectId: project.id }); await load(); });
  const addFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;
    return run(async () => {
      await call(`/api/projects/${project.id}/files`, "POST", { nome: fileName.trim(), url: fileUrl.trim(), kind: "aprovacao" });
      setFileName(""); setFileUrl(""); await load();
    }, project.clienteId ? "Enviado. O cliente foi avisado." : "Enviado para aprovação.");
  };
  const del = () => {
    if (!window.confirm(`Apagar o projeto "${project.titulo}"? As tarefas e arquivos dele saem junto.`)) return;
    return run(async () => { await call(`/api/projects/${project.id}`, "DELETE"); await onChanged(); onClose(); });
  };

  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/70" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={project.titulo} className="relative h-full w-full max-w-md overflow-y-auto bg-[#11101E] p-4 pb-10 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kb-faint text-[11px] uppercase tracking-[0.22em]">{project.contactCompany || project.contactName || "Sem cliente"}</p>
            <h2 className="font-display mt-1 break-words text-2xl leading-tight">{project.titulo}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="kb-chip min-h-11 min-w-11 text-xl leading-none">×</button>
        </div>
        {msg && <p role="status" className="kb-tag mt-3">{msg}</p>}

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Etapa">
          {PIPELINE.map((s) => (
            <button key={s.id} className="kb-chip min-h-11" aria-pressed={project.status === s.id} onClick={() => onMoved(project.id, s.id)}>{s.label}</button>
          ))}
        </div>
        {project.clienteId && <p className="kb-faint mt-2 text-xs">Mudar a etapa avisa o cliente no WhatsApp.</p>}

        <form onSubmit={save} className="kb-glass mt-5 grid gap-3 p-4">
          <label className="kb-field">Nome<input className="kb-control min-h-11" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} required /></label>
          <label className="kb-field">Cliente
            <select className="kb-control min-h-11" value={f.contactId} onChange={(e) => set("contactId", e.target.value)}>
              <option value="">Sem cliente</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.name} · ${c.company}` : c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="kb-field">Tipo
              <select className="kb-control min-h-11" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {!CATS.some(([c]) => c === f.categoria) && <option value={f.categoria}>{f.categoria}</option>}
                {CATS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </label>
            <label className="kb-field">Valor (R$)<input className="kb-control min-h-11" inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></label>
          </div>
          <label className="kb-field">Prazo<input type="date" className="kb-control min-h-11" value={f.prazo} onChange={(e) => set("prazo", e.target.value)} /></label>
          <label className="kb-field">Anotações<textarea className="kb-control min-h-24" value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
          <button type="submit" disabled={!dirty} className="kb-btn min-h-11">Salvar alterações</button>
        </form>

        <div className="kb-glass mt-4 flex items-center justify-between gap-3 p-4">
          <div>
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Tempo total</p>
            <p className="text-lg font-semibold">{fmt(total)}</p>
            {running && <p className="text-xs text-emerald-300">Timer rodando…</p>}
          </div>
          <button onClick={() => timer(running ? "stop" : "start")} className={`min-h-11 rounded-full px-5 text-xs font-bold uppercase tracking-[0.15em] ${running ? "bg-rose-400 text-black" : "bg-emerald-400 text-black"}`}>{running ? "■ Parar" : "▶ Iniciar"}</button>
        </div>

        <h3 className="mt-6 text-base font-semibold">Tarefas <span className="kb-faint text-xs font-normal">{done}/{tasks.length}</span></h3>
        <form onSubmit={addTask} className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <input className="kb-control min-h-11" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa…" aria-label="Nova tarefa" />
          <button type="submit" className="kb-btn min-h-11 min-w-11" aria-label="Adicionar tarefa">+</button>
          <input type="date" className="kb-control min-h-11 col-span-2" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Prazo da tarefa (opcional)" />
        </form>
        <ul className="mt-3 flex flex-col gap-2">
          {tasks.map((t) => (
            <li key={t.id} className="kb-card !flex-row items-center gap-2 !p-2">
              <button onClick={() => cycle(t)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left text-sm" aria-label={`${t.titulo}: ${LABEL[t.status] ?? t.status}. Toque para avançar`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${t.status === "done" ? "border-emerald-400 bg-emerald-400 text-black" : t.status === "doing" ? "border-[#E80EFD]/70 text-[#E80EFD]" : "border-white/30 text-transparent"}`}>{t.status === "doing" ? "…" : "✓"}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block break-words ${t.status === "done" ? "kb-faint line-through" : ""}`}>{t.titulo}</span>
                  {t.dueAt && <span className="kb-faint text-[11px]">até {new Date(t.dueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Belem" })}</span>}
                </span>
                <span className="kb-faint shrink-0 text-[10px] uppercase tracking-[0.12em]">{LABEL[t.status] ?? t.status}</span>
              </button>
              <button onClick={() => delTask(t)} aria-label={`Apagar tarefa ${t.titulo}`} className="kb-chip min-h-11 min-w-11">×</button>
            </li>
          ))}
          {tasks.length === 0 && <li className="kb-faint text-sm">Sem tarefas ainda.</li>}
        </ul>

        <h3 className="mt-6 text-base font-semibold">Arquivos para aprovação</h3>
        <form onSubmit={addFile} className="mt-2 flex flex-col gap-2">
          <input className="kb-control min-h-11" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="Nome do arquivo" aria-label="Nome do arquivo" />
          <input className="kb-control min-h-11" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Link (Drive, Frame.io…)" aria-label="Link do arquivo" inputMode="url" />
          <button type="submit" className="kb-btn-ghost min-h-11">Enviar para aprovação</button>
        </form>
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((x) => (
            <li key={x.id} className="kb-card !flex-row items-center justify-between gap-2 !p-3 text-sm">
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{x.nome}</a>
              <span className="kb-tag shrink-0">{x.status}</span>
            </li>
          ))}
        </ul>

        <button onClick={del} className="kb-chip mt-8 min-h-11 text-rose-300">Apagar projeto</button>
      </aside>
    </div>
  );
}
