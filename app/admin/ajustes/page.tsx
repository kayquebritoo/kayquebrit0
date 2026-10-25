import Link from "next/link";
import { KbosShell } from "@/components/kbos/Shell";
import InboxChannels from "@/components/kbos/InboxChannels";
import SocialAccounts from "@/components/kbos/SocialAccounts";

export const metadata = { title: "Ajustes — KBOS" };

const card = "kb-card flex min-w-0 flex-col gap-1 p-4 transition hover:border-white/25";

export default function AjustesPage() {
  return (
    <KbosShell title="Ajustes" subtitle="Conexões, seu acesso e o resto que não precisa ficar no menu" admin>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-10">
        <section aria-labelledby="aj-con" className="flex flex-col gap-3">
          <h2 id="aj-con" className="kb-faint text-[11px] uppercase tracking-[0.2em]">Conexões com apps externos</h2>
          <InboxChannels />
          <SocialAccounts />
        </section>

        <section aria-labelledby="aj-eu" className="flex flex-col gap-3">
          <h2 id="aj-eu" className="kb-faint text-[11px] uppercase tracking-[0.2em]">Você</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/portal/conta" className={card}><span className="font-medium">Meu acesso</span><span className="kb-muted text-sm">Nome de usuário, e-mail e login com Google.</span></Link>
            <Link href="/apresentacao" className={card}><span className="font-medium">Sobre o KBOS</span><span className="kb-muted text-sm">O que a plataforma faz, para mostrar a quem perguntar.</span></Link>
          </div>
        </section>

        <section aria-labelledby="aj-rev" className="flex flex-col gap-3">
          <h2 id="aj-rev" className="kb-faint text-[11px] uppercase tracking-[0.2em]">Vão para dentro dos projetos</h2>
          <p className="kb-muted text-sm">Esses dois saíram do menu porque pertencem ao cliente e ao projeto. Continuam funcionando aqui até a mudança.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/briefings" className={card}><span className="font-medium">Briefings recebidos</span><span className="kb-muted text-sm">Pedidos que chegam pelo formulário do site; viram contato e projeto.</span></Link>
            <Link href="/admin/planejamentos" className={card}><span className="font-medium">Marcas e planejamentos</span><span className="kb-muted text-sm">Depois que o cliente aceita o orçamento: direção criativa que ele valida.</span></Link>
          </div>
        </section>
      </div>
    </KbosShell>
  );
}
