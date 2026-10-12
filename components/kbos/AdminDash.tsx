"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminDash() {
  const [stats, setStats] = useState({ projetos: 0, briefingsNovos: 0, aReceber: 0, aPagar: 0, agenda: 0 });
  const [noDb, setNoDb] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, b, t, a] = await Promise.all([
          fetch("/api/projects").then((r) => {
            if (!r.ok) throw new Error("db");
            return r.json();
          }),
          fetch("/api/briefings").then((r) => r.json()),
          fetch("/api/transactions").then((r) => r.json()),
          fetch("/api/events?upcoming=1").then((r) => r.json()),
        ]);
        const sum = (xs: { tipo: string; status: string; valor: string }[], f: (x: (typeof xs)[number]) => boolean) =>
          xs.filter(f).reduce((a, x) => a + Number(x.valor || 0), 0);
        setStats({
          projetos: (p.items || []).length,
          briefingsNovos: (b.items || []).filter((x: { status: string }) => x.status === "novo").length,
          aReceber: sum(t.items || [], (x) => x.tipo === "entrada" && x.status !== "pago"),
          aPagar: sum(t.items || [], (x) => x.tipo === "saida" && x.status !== "pago"),
          agenda: (a.items || []).length,
        });
      } catch {
        setNoDb(true);
      }
    })();
  }, []);

  if (noDb) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/30 bg-amber-300/10 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-amber-200">Banco não conectado</p>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Defina <code>DATABASE_URL</code> no ambiente e rode <code>npx drizzle-kit push</code> para
          criar as tabelas <code>kbos_*</code>.
        </p>
      </div>
    );
  }

  const cards = [
    { href: "/admin/crm", label: "CRM", value: "◎", desc: "Leads, clientes e parceiros" },
    { href: "/admin/kanban", label: "Kanban de vendas", value: "▦", desc: "Pipeline prospect → ganho" },
    { href: "/admin/inbox", label: "Inbox", value: "✉", desc: "Conversas omnichannel" },
    { href: "/admin/campaigns", label: "Campanhas", value: "◉", desc: "Disparos em massa" },
    { href: "/admin/projetos", label: "Projetos / Kanban", value: String(stats.projetos), desc: "Pipeline por status" },
    { href: "/admin/cursos", label: "Cursos", value: "▶", desc: "Plataforma + vitrine" },
    { href: "/admin/briefings", label: "Briefings novos", value: String(stats.briefingsNovos), desc: "Aguardando análise" },
    { href: "/admin/financeiro", label: "A receber", value: brl(stats.aReceber), desc: "Entradas pendentes" },
    { href: "/admin/financeiro", label: "A pagar", value: brl(stats.aPagar), desc: "Saídas pendentes" },
    { href: "/admin/agenda", label: "Agenda", value: String(stats.agenda), desc: "Próximos compromissos" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-white/30 hover:shadow-xl hover:shadow-black/30 active:scale-[0.99]">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">{c.label}</p>
          <p className="font-display mt-2 text-3xl font-light transition-transform duration-200 group-hover:scale-105">{c.value}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{c.desc}</p>
        </Link>
      ))}
    </div>
  );
}
