"use client";
import { useEffect, useState } from "react";
import ConnectLinkButton from "./ConnectLinkButton";
import { NetMark, connectHref, netInfo, type ProviderInfo, type SocialAccount } from "./networks";

/** Ficha do projeto (admin): redes conectadas deste cliente, conectar direto ou mandar o link ao cliente. */
export default function ProjectSocial({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [items, setItems] = useState<SocialAccount[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/social/accounts/?projectId=${projectId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setItems(j?.items ?? []); setProviders(j?.providers ?? []); } })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [projectId]);
  const back = "/admin/projetos/";
  return (
    <section className="mt-6" aria-label="Redes sociais do cliente">
      <h3 className="text-base font-semibold">Redes sociais</h3>
      {items === null ? <div className="kb-skel mt-2 h-14" /> : (
        <div className="mt-2 flex flex-col gap-2">
          {items.length === 0 && <p className="kb-muted text-sm">Nenhuma conta conectada para este cliente.</p>}
          {items.map((a) => (
            <div key={a.id} className="flex min-w-0 items-center gap-2 text-sm">
              <NetMark network={a.network} size={28} />
              <span className="min-w-0 flex-1 truncate">{a.name}{a.username ? ` · @${a.username}` : ""}</span>
              <span className={`shrink-0 text-xs ${a.status === "ativo" ? "text-[var(--kb-good)]" : "text-[var(--kb-soon)]"}`}>{a.status === "ativo" ? netInfo(a.network).label : "Reconectar"}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5">
            {providers.filter((p) => p.configured).map((p) => (
              <a key={p.id} href={connectHref(p.id, { project: projectId, back })} className="kb-chip min-h-11 px-3 text-sm content-center">+ {p.label}</a>
            ))}
          </div>
          <ConnectLinkButton projectId={projectId} projectName={projectName} />
        </div>
      )}
    </section>
  );
}
