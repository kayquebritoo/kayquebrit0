"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminDash() {
  const [stats, setStats] = useState({ projetos: 0, briefingsNovos: 0, aReceber: 0, aPagar: 0, agenda: 0 });
  const [alerts, setAlerts] = useState({ orcamentos: 0, orcamentosValor: 0, cobrancas: 0, cobrancasValor: 0, reunioesHoje: 0 });
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [briefingMsg, setBriefingMsg] = useState<string | null>(null);
  const [noDb, setNoDb] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, b, t, a, d] = await Promise.all([
          fetch("/api/projects").then((r) => {
            if (!r.ok) throw new Error("db");
            return r.json();
          }),
          fetch("/api/briefings").then((r) => r.json()),
          fetch("/api/transactions").then((r) => r.json()),
          fetch("/api/events?upcoming=1").then((r) => r.json()),
          fetch("/api/deals").then((r) => r.json()),
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
        // Alertas do briefing matinal (mesmos critérios do worker).
        const deals = (d.items || []) as { stage: string; value: string }[];
        const waiting = deals.filter((x) => x.stage === "proposal" || x.stage === "negotiation");
        const trxs = (t.items || []) as { tipo: string; status: string; valor: string }[];
        const charges = trxs.filter((x) => x.status === "pendente" || x.status === "vencido");
        const todayKey = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const todays = ((a.items || []) as { startTime: string }[]).filter(
          (e) =>
            new Date(e.startTime).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === todayKey
        );
        setAlerts({
          orcamentos: waiting.length,
          orcamentosValor: waiting.reduce((acc, x) => acc + Number(x.value || 0), 0),
          cobrancas: charges.length,
          cobrancasValor: charges.reduce((acc, x) => acc + Number(x.valor || 0), 0),
          reunioesHoje: todays.length,
        });
      } catch {
        setNoDb(true);
      }
    })();
  }, []);

  const triggerBriefing = async () => {
    setBriefingBusy(true);
    setBriefingMsg(null);
    try {
      const r = await fetch("/api/ai/briefing/trigger", { method: "POST" });
      const j = await r.json();
      setBriefingMsg(
        r.ok
          ? `Briefing enviado (${j.counts?.meetings ?? 0} reuniões · ${j.counts?.quotes ?? 0} orçamentos · ${j.counts?.charges ?? 0} cobranças).`
          : (j.error as string) || "Falha ao disparar o briefing."
      );
    } catch {
      setBriefingMsg("Falha ao disparar o briefing.");
    } finally {
      setBriefingBusy(false);
    }
  };

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
    <div className="space-y-4">
      {/* Alertas do briefing matinal — o que precisa de ação hoje. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/kanban" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-amber-300/60">
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200/70">💼 Aguardando orçamento</p>
          <p className="font-display mt-2 text-3xl font-light">{alerts.orcamentos}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{brl(alerts.orcamentosValor)} em proposta/negociação</p>
        </Link>
        <Link href="/admin/financeiro" className="rounded-2xl border border-red-300/30 bg-red-400/[0.07] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-red-300/60">
          <p className="text-[11px] uppercase tracking-[0.25em] text-red-200/70">💰 Cobranças pendentes</p>
          <p className="font-display mt-2 text-3xl font-light">{alerts.cobrancas}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{brl(alerts.cobrancasValor)} pendente/vencido</p>
        </Link>
        <Link href="/admin/agenda" className="rounded-2xl border border-sky-300/30 bg-sky-400/[0.07] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/60">
          <p className="text-[11px] uppercase tracking-[0.25em] text-sky-200/70">📅 Reuniões do dia</p>
          <p className="font-display mt-2 text-3xl font-light">{alerts.reunioesHoje}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">Compromissos hoje</p>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">☀️ Briefing matinal</p>
          <p className="truncate text-[13px] text-white/50">
            {briefingMsg ?? "Enviado todo dia às 08:00 via WhatsApp. Dispare agora para validar."}
          </p>
        </div>
        <button
          onClick={triggerBriefing}
          disabled={briefingBusy}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm transition-colors hover:border-white/50 disabled:opacity-50"
        >
          {briefingBusy ? "Enviando…" : "Disparar agora"}
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-200 hover:-translate-y-1 hover:border-white/30 hover:shadow-xl hover:shadow-black/30 active:scale-[0.99]">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">{c.label}</p>
          <p className="font-display mt-2 text-3xl font-light transition-transform duration-200 group-hover:scale-105">{c.value}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{c.desc}</p>
        </Link>
      ))}
      </div>
    </div>
  );
}
