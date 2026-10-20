import Link from "next/link";
import LumeMark from "@/components/kbos/lume/LumeMark";
import { hubFor, lumeHref } from "@/lib/kbos/client-hubs";

/** Atalhos do cliente que tem várias empresas: arquivos (Lume) por empresa, contratos, projetos e tarefas. */
export default function ClientHubLinks({ name, company }: { name?: string | null; company?: string | null }) {
  const hub = hubFor(name, company);
  if (!hub) return null;
  return (
    <section className="kb-glass min-w-0 space-y-3 p-4" aria-label={`Atalhos do ${hub.label}`}>
      <div className="flex items-center gap-3">
        <LumeMark size={34} animate />
        <div className="min-w-0">
          <p className="cp-eyebrow">{hub.label.toUpperCase()} · ARQUIVOS NO LUME</p>
          <p className="kb-muted text-[12px]">Fotos e vídeos de cada empresa, abertos direto no Lume.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="kb-chip min-h-11 items-center" href={lumeHref(hub.pasta)} target="_blank" rel="noopener noreferrer">Todo o grupo ↗</a>
        {hub.empresas.map((e) => (
          <a key={e.key} className="kb-chip min-h-11 items-center" href={lumeHref(e.pasta)} target="_blank" rel="noopener noreferrer">{e.label} ↗</a>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
        <Link className="kb-chip min-h-11 items-center" href="/admin/orcamentos">Contratos</Link>
        <Link className="kb-chip min-h-11 items-center" href="/admin/projetos">Projetos</Link>
        <Link className="kb-chip min-h-11 items-center" href="/admin/tarefas">Tarefas</Link>
      </div>
    </section>
  );
}
