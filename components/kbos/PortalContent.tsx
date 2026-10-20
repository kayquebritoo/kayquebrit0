"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PIPELINE } from "@/lib/kbos/constants";
import ApproveButtons from "@/components/kbos/ApproveButtons";
import PortalLumeCard from "@/components/kbos/PortalLumeCard";

type Project = { id: string; titulo: string; categoria: string; status: string; prazo?: string | null };
type FileItem = { id: string; projectId: string; nome: string; url: string; status: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Belem" });

export default function PortalContent({ firstName }: { firstName?: string }) {
  const [name, setName] = useState(firstName || "");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState("");

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
        if (!alive) return;
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
        <p className="text-lg font-semibold">Nenhum projeto por aqui ainda</p>
        <p className="kb-muted mt-2 text-sm">Quando o Kayque abrir o seu projeto, ele aparece aqui com as etapas e os arquivos para você aprovar. Para começar, preencha um <Link href="/briefing" className="underline">briefing</Link>.</p>
      </div>
    );
  }

  const pending = files.filter((f) => f.status === "enviado").length;
  return (
    <div className="kb-stagger flex flex-col gap-5">
      <div>
        <p className="text-lg font-light">Olá{name ? `, ${name}` : ""}.</p>
        <p className="kb-muted text-sm">{pending ? `Você tem ${pending} arquivo${pending > 1 ? "s" : ""} esperando sua aprovação.` : "Aqui você acompanha cada etapa e aprova as entregas."}</p>
      </div>
      <PortalLumeCard />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const idx = Math.max(0, PIPELINE.findIndex((s) => s.id === p.status));
          const mine = files.filter((f) => f.projectId === p.id);
          return (
            <article key={p.id} className="kb-glass flex flex-col gap-4 p-5">
              <div>
                <p className="kb-faint text-[11px] uppercase tracking-[0.22em]">{p.categoria}</p>
                <h2 className="font-display mt-1 break-words text-xl">{p.titulo}</h2>
                {p.prazo && p.status !== "entregue" && <p className="kb-muted mt-1 text-sm">Previsão: {day(p.prazo)}</p>}
              </div>
              <ol className="flex gap-1" aria-label="Etapas do projeto">
                {PIPELINE.map((s, i) => (
                  <li key={s.id} className="min-w-0 flex-1" aria-current={i === idx ? "step" : undefined}>
                    <span className={`block h-1.5 rounded-full ${i <= idx ? "bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" : "bg-white/10"}`} />
                    <span className={`mt-1.5 block truncate text-[10px] uppercase tracking-[0.08em] ${i === idx ? "font-semibold" : "kb-faint"}`}>{s.label}</span>
                  </li>
                ))}
              </ol>
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
    </div>
  );
}
