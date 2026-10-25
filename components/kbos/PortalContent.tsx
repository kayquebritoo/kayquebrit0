"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PIPELINE } from "@/lib/kbos/constants";
import ApproveButtons from "@/components/kbos/ApproveButtons";
import PortalLumeCard from "@/components/kbos/PortalLumeCard";
import ProjectChat from "@/components/kbos/ProjectChat";
import PortalPosts from "@/components/kbos/PortalPosts";
import OverduePosts from "@/components/kbos/OverduePosts";

type Project = { id: string; titulo: string; categoria: string; status: string; prazo?: string | null };
type TaskItem = { id: string; projectId: string | null; titulo: string; status: string; dueAt: string | null };
type Invoice = { id: string; projectId: string | null; descricao: string; valor: string; status: string; vencimento: string | null };
type FileItem = { id: string; projectId: string; nome: string; url: string; status: string };

const brl = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS_INV: Record<string, string> = { pendente: "A pagar", pago: "Pago", vencido: "Em atraso" };
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Belem" });

export default function PortalContent({ firstName }: { firstName?: string }) {
  const [name, setName] = useState(firstName || "");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [chat, setChat] = useState<Project | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}));
        if (me.user?.name && alive) setName(me.user.name.split(" ")[0]);
        const p = await fetch("/api/projects", { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("Não consegui carregar seus projetos agora.");
          return r.json();
        });
        const items: Project[] = p.items || [];
        const lists = await Promise.all(
          items.map((proj) => fetch(`/api/projects/${proj.id}/files`).then((r) => (r.ok ? r.json() : { items: [] })).then((f) => (f.items || []).map((x: FileItem) => ({ ...x, projectId: proj.id })))),
        );
        const ov = await fetch("/api/portal/overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!alive) return;
        if (ov) { setTasks(ov.tasks || []); setInvoices(ov.invoices || []); setUnread(ov.unread || {}); }
        setProjects(items);
        setFiles(lists.flat());
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro ao carregar.");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="kb-glass mx-auto max-w-xl p-6 text-center">
        <p className="text-lg font-semibold">Não deu para abrir agora</p>
        <p className="kb-muted mt-2 text-sm">{error} Tente de novo em instantes; se continuar, fale com o Kayque.</p>
        <button type="button" className="kb-btn mt-4 min-h-11" onClick={() => window.location.reload()}>Tentar de novo</button>
      </div>
    );
  }
  if (!projects) return <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="kb-skel h-48" />)}</div>;

  if (projects.length === 0) {
    return (
      <div className="kb-glass p-8 text-center">
        <p className="text-lg font-semibold">{name ? `${name}, seu acesso está criado` : "Seu acesso está criado"}</p>
        <p className="kb-muted mt-2 text-sm">Falta só ligar você ao projeto da sua empresa. Assim que o Kayque fizer isso, aparecem aqui o calendário de conteúdo para aprovar, as tarefas e os arquivos. Se ainda não houver projeto, comece por um <Link href="/briefing" className="underline">briefing</Link>.</p>
      </div>
    );
  }

  const pending = files.filter((f) => f.status === "enviado").length;
  const open = tasks.filter((t) => t.status !== "done");
  return (
    <div className="kb-stagger flex flex-col gap-5">
      <header className="relative overflow-hidden rounded-3xl">
        <div aria-hidden className="h-24 sm:h-32" style={{ background: "linear-gradient(120deg,#350C85,#4F12C7 55%,#E80EFD)" }}>
          <span className="block h-full w-full opacity-40" style={{ background: "radial-gradient(60% 120% at 80% 0%,#ffffff55,transparent 60%)" }} />
        </div>
        <div className="flex items-center gap-4 bg-[#11101E] p-4">
          <span aria-hidden className="-mt-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[#11101E] bg-[var(--kb-accent-soft)] text-2xl font-semibold uppercase">{(name || "?").slice(0, 1)}</span>
          <div className="min-w-0">
            <p className="font-display truncate text-xl">Olá{name ? `, ${name}` : ""}.</p>
            <p className="kb-muted text-sm">{pending ? `Você tem ${pending} arquivo${pending > 1 ? "s" : ""} esperando sua aprovação.` : open.length ? `${open.length} tarefa${open.length > 1 ? "s" : ""} em andamento no seu projeto.` : "Aqui você acompanha cada etapa e aprova as entregas."}</p>
          </div>
        </div>
      </header>
      <OverduePosts audience="cliente" />
      <PortalPosts />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const idx = Math.max(0, PIPELINE.findIndex((s) => s.id === p.status));
          const mine = files.filter((f) => f.projectId === p.id);
          const all = tasks.filter((t) => t.projectId === p.id);
          const done = all.filter((t) => t.status === "done").length;
          const todo = all.filter((t) => t.status !== "done").sort((a, b) => (a.status === b.status ? 0 : a.status === "doing" ? -1 : 1));
          return (
            <article key={p.id} className="kb-glass flex flex-col gap-4 p-5">
              <div>
                <p className="kb-faint text-[11px] uppercase tracking-[0.22em]">{p.categoria}</p>
                <h2 className="font-display mt-1 break-words text-xl">{p.titulo}</h2>
                {p.prazo && p.status !== "entregue" && <p className="kb-muted mt-1 text-sm">Previsão: {day(p.prazo)}</p>}
              </div>
              <button type="button" className="kb-btn-ghost min-h-11 self-start" onClick={() => setChat(p)}>
                Conversar com a equipe{unread[p.id] ? <span className="kb-tag ml-2">{unread[p.id]} nova{unread[p.id] > 1 ? "s" : ""}</span> : null}
              </button>
              <ol className="flex gap-1" aria-label="Etapas do projeto">
                {PIPELINE.map((s, i) => (
                  <li key={s.id} className="min-w-0 flex-1" aria-current={i === idx ? "step" : undefined}>
                    <span className={`block h-1.5 rounded-full ${i <= idx ? "bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" : "bg-white/10"}`} />
                    <span className={`mt-1.5 block truncate text-[10px] uppercase tracking-[0.08em] ${i === idx ? "font-semibold" : "kb-faint"}`}>{s.label}</span>
                  </li>
                ))}
              </ol>
              {all.length > 0 && (
                <div className="border-t border-white/10 pt-4" aria-label="Tarefas do projeto">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Tarefas</p>
                    <span className="kb-faint text-xs tabular-nums">{done} de {all.length} concluídas</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done}>
                    <span className="block h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" style={{ width: `${(done / all.length) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-col">
                    {todo.slice(0, expanded[p.id] ? todo.length : 5).map((t) => (
                      <div key={t.id} className="kb-row">
                        <span className="min-w-0 truncate text-sm">{t.titulo}</span>
                        <span className="kb-faint shrink-0 text-xs">{t.status === "doing" ? "Em produção" : "Na fila"}{t.dueAt ? ` · ${day(t.dueAt)}` : ""}</span>
                      </div>
                    ))}
                    {todo.length === 0 && <p className="kb-faint py-2 text-sm">Tudo concluído por aqui.</p>}
                  </div>
                  {todo.length > 5 && <button type="button" className="kb-btn-ghost mt-2 min-h-11 w-full" onClick={() => setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))}>{expanded[p.id] ? "Mostrar menos" : `Ver todas (${todo.length})`}</button>}
                </div>
              )}
              <div className="border-t border-white/10 pt-4">
                <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Arquivos para aprovação</p>
                <div className="mt-3 flex flex-col gap-3">
                  {mine.map((f) => (
                    <div key={f.id} className="kb-card gap-3 sm:!flex-row sm:items-center sm:justify-between">
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-sm underline-offset-2 hover:underline">{f.nome} ↗</a>
                      <ApproveButtons projectId={p.id} fileId={f.id} status={f.status} />
                    </div>
                  ))}
                  {mine.length === 0 && <p className="kb-faint text-sm">Nada para aprovar no momento.</p>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <PortalLumeCard />
      {invoices.length > 0 && (
        <section className="kb-glass p-5" aria-label="Pagamentos">
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Pagamentos</p>
          <div className="mt-3 flex flex-col">
            {invoices.slice(0, 8).map((i) => (
              <div key={i.id} className="kb-row">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{i.descricao}</span>
                  <span className="kb-faint block text-xs">{i.vencimento ? day(i.vencimento) : "Sem data"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tabular-nums text-sm">{brl(i.valor)}</span>
                  <span className={`kb-tag ${i.status === "vencido" ? "late" : ""}`}>{STATUS_INV[i.status] ?? i.status}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {chat && <ProjectChat projectId={chat.id} title={chat.titulo} onClose={() => { setUnread((u) => ({ ...u, [chat.id]: 0 })); setChat(null); }} />}
    </div>
  );
}
