"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@/lib/kbos/constants";

export function DbNote() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-300/30 bg-amber-300/10 px-6 py-8 text-center">
      <p className="text-lg font-semibold text-amber-200">Banco não conectado</p>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        Defina <code>DATABASE_URL</code> no ambiente e rode <code>npx drizzle-kit push</code> para
        criar as tabelas <code>kbos_*</code>. O site público segue funcionando normalmente.
      </p>
    </div>
  );
}

type Me = { name: string; email: string; role: keyof typeof ROLE_LABELS };

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "◈", adminOnly: true, exact: true },
  { href: "/admin/crm", label: "CRM", icon: "◎", adminOnly: true },
  { href: "/admin/kanban", label: "Vendas", icon: "▦", adminOnly: true },
  { href: "/admin/inbox", label: "Inbox", icon: "✉", adminOnly: true },
  { href: "/admin/campaigns", label: "Campanhas", icon: "◉", adminOnly: true },
  { href: "/admin/projetos", label: "Projetos", icon: "▤", adminOnly: false },
  { href: "/admin/cursos", label: "Cursos", icon: "▶", adminOnly: true },
  { href: "/admin/briefings", label: "Briefings", icon: "✎", adminOnly: true },
  { href: "/admin/financeiro", label: "Financeiro", icon: "₿", adminOnly: true },
  { href: "/admin/orcamentos", label: "Orçamentos", icon: "❐", adminOnly: true },
  { href: "/admin/agenda", label: "Agenda", icon: "◔", adminOnly: true },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "✆", adminOnly: true },
];

// Guard client-side (funciona no export estático e no server):
// sem sessão -> /entrar; área admin exige role admin.
export function KbosShell({
  children,
  title,
  subtitle,
  admin,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  admin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me");
        if (!r.ok) throw new Error("auth");
        const d = await r.json();
        if (admin && d.user.role !== "admin") {
          router.replace("/portal");
          return;
        }
        if (alive) setUser(d.user);
      } catch {
        router.replace("/entrar");
      }
    })();
    return () => {
      alive = false;
    };
  }, [admin, router]);

  // Fecha o drawer ao navegar (mobile).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Trava o scroll do body com o drawer aberto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/entrar");
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] text-white/50">
        <p className="animate-pulse text-sm uppercase tracking-[0.3em]">KBOS · verificando acesso...</p>
      </main>
    );
  }

  const links = NAV.filter((n) => !n.adminOnly || user.role === "admin" || (n.href === "/admin/projetos" && user.role !== "cliente"));
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/admin" className="group flex items-center gap-3 px-5 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg font-bold text-black transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
          K
        </span>
        <span>
          <span className="block text-[10px] uppercase tracking-[0.3em] text-white/40">KBOS</span>
          <span className="font-display block text-base leading-tight">Painel</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {links.map((n) => {
          const active = isActive(n.href, n.exact);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 ${
                active
                  ? "bg-white font-semibold text-black shadow-lg shadow-black/30"
                  : "text-white/65 hover:translate-x-1 hover:bg-white/10 hover:text-white active:scale-[0.98]"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] transition-colors ${
                  active ? "bg-black/10" : "bg-white/10 group-hover:bg-white/20"
                }`}
              >
                {n.icon}
              </span>
              {n.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </Link>
          );
        })}
        <p className="px-3.5 pb-1 pt-5 text-[10px] uppercase tracking-[0.25em] text-white/30">Área pública</p>
        <Link
          href="/portal"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-white/65 transition-all duration-200 hover:translate-x-1 hover:bg-white/10 hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[13px]">⌂</span>
          Portal
        </Link>
        <Link
          href="/portal/cursos"
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-white/65 transition-all duration-200 hover:translate-x-1 hover:bg-white/10 hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-[13px]">❖</span>
          Meus cursos
        </Link>
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold uppercase">
            {(user.name || user.email || "?").slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-white/45">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="rounded-lg px-2 py-1.5 text-[11px] uppercase tracking-[0.15em] text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0B1E] text-[#F4F1EC] lg:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[#0e0e22]/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {/* Drawer mobile */}
      <div
        className={`fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-[90] w-[280px] max-w-[85vw] border-r border-white/10 bg-[#0e0e22] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-label="Menu administrativo"
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          className="absolute right-3 top-4 rounded-lg px-2 py-1 text-2xl leading-none text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
        {sidebar}
      </aside>

      {/* Coluna principal */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[40] border-b border-white/10 bg-[#0B0B1E]/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 md:px-10">
            <button
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              className="rounded-xl border border-white/15 p-2.5 text-lg leading-none transition hover:bg-white/10 active:scale-95 lg:hidden"
            >
              ☰
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">KBOS · Admin</p>
              <h1 className="font-display truncate text-xl font-light md:text-2xl">{title}</h1>
              {subtitle && <p className="truncate text-[13px] text-white/50">{subtitle}</p>}
            </div>
            <span className="hidden rounded-full bg-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-white/70 sm:block">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl animate-[kbosIn_0.35s_ease] px-5 pb-20 pt-6 md:px-10 md:pt-8">
          {children}
        </main>
      </div>
      <style>{`@keyframes kbosIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
