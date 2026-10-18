"use client";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { PIPELINE } from "@/lib/kbos/constants";
import ApproveButtons from "@/components/kbos/ApproveButtons";

type Project = { id: string; titulo: string; categoria: string; status: string };
type FileItem = { id: string; projectId: string; nome: string; url: string; status: string };

export default function PortalContent({ firstName }: { firstName?: string }) {
  const [name, setName] = useState(firstName || "lá");
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [noDb, setNoDb] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me").then((r) => r.json());
        if (me.user?.name && alive) setName(me.user.name.split(" ")[0]);
        const p = await fetch("/api/projects").then((r) => {
          if (!r.ok) throw new Error("db");
          return r.json();
        });
        const groups = await Promise.all((p.items || []).map(async (proj: Project) => {
          const response = await fetch(`/api/projects/${proj.id}/files`);
          if (!response.ok) throw new Error("files");
          const f = await response.json();
          return (f.items || []).map((x: FileItem) => ({ ...x, projectId: proj.id }));
        }));
        const all: FileItem[] = groups.flat();
        if (!alive) return;
        setProjects(p.items || []);
        setFiles(all);
      } catch {
        if (alive) setNoDb(true);
      } finally { if(alive) setLoading(false); }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const label = (s: string) => PIPELINE.find((p) => p.id === s)?.label ?? s;

  if (loading) return <div className="portal-loading" role="status" aria-label="Carregando seus projetos"><span className="sr-only">Preparando seu espaço…</span>{[0,1,2].map(i=><div key={i} className="portal-skeleton"><span/><span/><span/></div>)}</div>;

  if (noDb) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/30 bg-amber-300/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-amber-200">Não conseguimos carregar seu espaço.</p>
        <p className="mt-2 text-sm leading-relaxed kb-muted">
          Sua conexão pode ter oscilado. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="portal-empty kb-glass p-8 text-center">
        <span className="portal-spark" aria-hidden="true">✦</span><h2 className="text-2xl mb-3">Seu próximo projeto começa aqui.</h2>
        <p className="kb-muted">Nenhum projeto por aqui ainda.</p>
        <p className="mt-2 text-sm font-light kb-muted">
          Preencha um <Link href="/briefing" className="underline underline-offset-4">briefing</Link> para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="portal-space">
      <header className="portal-welcome"><div><p className="auth-kicker">IDEIAS EM MOVIMENTO</p><h2>Olá, {name}.</h2><p>Veja o que estamos criando juntos e acompanhe cada próximo passo.</p></div><span className="portal-live"><i aria-hidden="true"/>Seu espaço de criação</span></header>
      <div className="portal-overview"><div><span>Projetos</span><strong>{projects.length.toString().padStart(2,'0')}</strong></div><div><span>Para você validar</span><strong>{files.filter(f=>f.status==='enviado').length.toString().padStart(2,'0')}</strong></div><Link href="/portal/conta/">Meu acesso <span aria-hidden="true">↗</span></Link></div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p,index) => (
          <article key={p.id} className="portal-project kb-glass p-5 sm:p-6" style={{"--card-order":Math.min(index,5)} as CSSProperties}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">{p.categoria}</p>
                <h2 className="font-display mt-1 text-xl">{p.titulo}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/75">
                {label(p.status)}
              </span>
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[12px] uppercase tracking-[0.2em] kb-muted">Arquivos para aprovação</p>
              <div className="mt-3 space-y-3">
                {files.filter((f) => f.projectId === p.id).map((f) => (
                  <div key={f.id} className="portal-file flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/10 px-4 py-3">
                    <a href={f.url} target="_blank" rel="noopener" className="truncate text-sm text-white/85 hover:text-white">
                      {f.nome}
                    </a>
                    <ApproveButtons projectId={p.id} fileId={f.id} status={f.status} onChange={status=>setFiles(current=>current.map(file=>file.id===f.id?{...file,status}:file))} />
                  </div>
                ))}
                {files.filter((f) => f.projectId === p.id).length === 0 && (
                  <p className="text-sm font-light text-white/40">Nada pendente no momento.</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
