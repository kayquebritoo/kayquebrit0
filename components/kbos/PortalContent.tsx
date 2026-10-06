"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PIPELINE } from "@/lib/kbos/constants";
import ApproveButtons from "@/components/kbos/ApproveButtons";

type Project = { id: string; titulo: string; categoria: string; status: string };
type FileItem = { id: string; projectId: string; nome: string; url: string; status: string };

export default function PortalContent({ firstName }: { firstName?: string }) {
  const [name, setName] = useState(firstName || "lá");
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [noDb, setNoDb] = useState(false);

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
        const all: FileItem[] = [];
        for (const proj of p.items || []) {
          const f = await fetch(`/api/projects/${proj.id}/files`).then((r) => r.json());
          all.push(...(f.items || []).map((x: FileItem) => ({ ...x, projectId: proj.id })));
        }
        if (!alive) return;
        setProjects(p.items || []);
        setFiles(all);
      } catch {
        if (alive) setNoDb(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const label = (s: string) => PIPELINE.find((p) => p.id === s)?.label ?? s;

  if (noDb) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/30 bg-amber-300/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-amber-200">Banco não conectado</p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Defina <code>DATABASE_URL</code> e rode <code>npx drizzle-kit push</code>.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="text-white/70">Nenhum projeto por aqui ainda.</p>
        <p className="mt-2 text-sm font-light text-white/45">
          Preencha um <Link href="/briefing" className="text-white underline">briefing</Link> para começar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-6 text-[15px] font-light text-white/60">Olá, {name} — acompanhe e aprove seus projetos.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <article key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
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
              <p className="text-[12px] uppercase tracking-[0.2em] text-white/45">Arquivos para aprovação</p>
              <div className="mt-3 space-y-3">
                {files.filter((f) => f.projectId === p.id).map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/30 px-4 py-3">
                    <a href={f.url} target="_blank" rel="noopener" className="truncate text-sm text-white/85 hover:text-white">
                      {f.nome}
                    </a>
                    <ApproveButtons projectId={p.id} fileId={f.id} status={f.status} />
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
