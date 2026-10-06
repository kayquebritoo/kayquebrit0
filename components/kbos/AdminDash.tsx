"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminDash() {
  const [stats, setStats] = useState({ projetos: 0, briefingsNovos: 0, aReceber: 0, aPagar: 0 });
  const [noDb, setNoDb] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, b, t] = await Promise.all([
          fetch("/api/projects").then((r) => {
            if (!r.ok) throw new Error("db");
            return r.json();
          }),
          fetch("/api/briefings").then((r) => r.json()),
          fetch("/api/transactions").then((r) => r.json()),
        ]);
        const sum = (xs: { tipo: string; status: string; valor: string }[], f: (x: (typeof xs)[number]) => boolean) =>
          xs.filter(f).reduce((a, x) => a + Number(x.valor || 0), 0);
        setStats({
          projetos: (p.items || []).length,
          briefingsNovos: (b.items || []).filter((x: { status: string }) => x.status === "novo").length,
          aReceber: sum(t.items || [], (x) => x.tipo === "entrada" && x.status !== "pago"),
          aPagar: sum(t.items || [], (x) => x.tipo === "saida" && x.status !== "pago"),
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
    { href: "/admin/projetos", label: "Projetos / Kanban", value: String(stats.projetos), desc: "Pipeline por status" },
    { href: "/admin/briefings", label: "Briefings novos", value: String(stats.briefingsNovos), desc: "Aguardando análise" },
    { href: "/admin/financeiro", label: "A receber", value: brl(stats.aReceber), desc: "Entradas pendentes" },
    { href: "/admin/financeiro", label: "A pagar", value: brl(stats.aPagar), desc: "Saídas pendentes" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} href={c.href} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/30">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">{c.label}</p>
          <p className="font-display mt-2 text-3xl font-light">{c.value}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{c.desc}</p>
        </Link>
      ))}
    </div>
  );
}
