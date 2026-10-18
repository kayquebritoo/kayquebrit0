"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ROLE_LABELS } from "@/lib/kbos/constants";
import { useTheme } from "@/components/Providers";

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

type NavLink = { href: string; label: string; adminOnly?: boolean; exact?: boolean };
type NavGroup = { id: string; label: string; icon: ReactNode; links: NavLink[] };

const ico = (d: string) => (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// Navegação em 4 grupos + Ajustes (proposta aprovada em 17/out/2026).
const GROUPS: NavGroup[] = [
  {
    id: "hoje",
    label: "Hoje",
    icon: ico("M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"),
    links: [{ href: "/admin", label: "Hoje", adminOnly: true, exact: true }],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: ico("M4 5h16v11H8l-4 4z"),
    links: [
      { href: "/admin/inbox", label: "Inbox", adminOnly: true },
      { href: "/admin/kanban", label: "Funil de vendas", adminOnly: true },
      { href: "/admin/crm", label: "Contatos", adminOnly: true },
      { href: "/admin/briefings", label: "Briefings", adminOnly: true },
      { href: "/admin/orcamentos", label: "Orçamentos e contratos", adminOnly: true },
      { href: "/admin/campaigns", label: "Campanhas", adminOnly: true },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    icon: ico("M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4"),
    links: [
      { href: "/admin/projetos", label: "Projetos e entregas" },
      { href: "/admin/agenda", label: "Agenda", adminOnly: true },
      { href: "/admin/cursos", label: "Cursos", adminOnly: true },
      { href: "/portal", label: "Portal do cliente" },
    ],
  },
  {
    id: "dinheiro",
    label: "Dinheiro",
    icon: ico("M3 7h18v10H3zM7 12h.01M17 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"),
    links: [{ href: "/admin/financeiro", label: "Fluxo de caixa", adminOnly: true }],
  },
  {
    id: "ajustes",
    label: "Mais",
    icon: ico("M5 12h.01M12 12h.01M19 12h.01"),
    links: [
      { href: "/admin/whatsapp", label: "Conexão do WhatsApp", adminOnly: true },
      { href: "/portal/cursos", label: "Meus cursos" },
    ],
  },
];

function ThemeButton() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Usar tema escuro" : "Usar tema claro"}
      className="kb-chip min-h-11! w-11! justify-center! p-0!"
    >
      {light ? (
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>
      ) : (
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
    </button>
  );
}

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
  const [sheet, setSheet] = useState<string | null>(null);
  // Fecha o painel de grupo ao navegar (ajuste de estado durante o render).
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setSheet(null);
  }

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

  // Vindo da home (navegação client-side), a trava de rolagem do fullpage
  // (`fullpage-locked`: html/body com overflow hidden) podia ficar presa e o
  // KBOS não rolava no desktop. Garante a rolagem normal ao entrar no painel.
  useEffect(() => {
    document.documentElement.classList.remove("fullpage-locked");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }, []);

  useEffect(() => {
    document.body.style.overflow = sheet ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheet]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/entrar");
  }

  if (!user) {
    return (
      <main className="kbos flex min-h-screen items-center justify-center">
        <p className="kb-muted animate-pulse text-sm">Verificando acesso…</p>
      </main>
    );
  }

  const isAdmin = user.role === "admin";
  const allowed = (l: NavLink) => !l.adminOnly || isAdmin;
  const groups = GROUPS.map((g) => ({ ...g, links: g.links.filter(allowed) })).filter((g) => g.links.length);
  const isActive = (l: NavLink) =>
    l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");
  const activeGroup = groups.find((g) => g.links.some(isActive))?.id ?? null;
  const openGroup = groups.find((g) => g.id === sheet) ?? null;
  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="kbos min-h-screen lg:flex">
      {/* ── Sidebar (desktop) ───────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 p-4 lg:block">
        <div className="kb-glass flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
          <Link href={isAdmin ? "/admin" : "/admin/projetos"} className="flex items-center gap-2.5 px-2">
            <span className="font-display inline-flex h-7 w-10 items-center justify-center rounded-[4px_9px_4px_4px] bg-[var(--kb-ink)] text-[15px] font-bold text-[var(--kb-bg)]">KB</span>
            <span className="font-display text-lg font-bold tracking-[0.08em]">KBOS</span>
          </Link>
          <nav aria-label="Navegação principal" className="flex flex-col gap-4">
            {groups.map((g) =>
              g.id === "hoje" ? (
                <Link key={g.id} href="/admin" aria-current={isActive(g.links[0]) ? "page" : undefined} className="kb-nav-link">
                  {g.icon}
                  Hoje
                </Link>
              ) : (
                <div key={g.id} className="flex flex-col gap-0.5">
                  <p className="kb-faint mb-1 px-3 text-xs">{g.id === "ajustes" ? "Ajustes" : g.label}</p>
                  {g.links.map((l) => (
                    <Link key={l.href} href={l.href} aria-current={isActive(l) ? "page" : undefined} className="kb-nav-link">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )
            )}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--kb-line)] px-2 pt-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--kb-accent-soft)] text-sm font-semibold">{initial}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="kb-faint text-[11px]">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <ThemeButton />
          </div>
          <button type="button" onClick={logout} className="kb-nav-link -mt-2">
            Sair
          </button>
        </div>
      </aside>

      {/* ── Coluna principal ────────────────────────── */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-[40] bg-[var(--kb-glass-solid)] pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-8 lg:pt-6">
            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-xl font-light lg:text-2xl">{title}</h1>
              {subtitle && <p className="kb-muted truncate text-[13px]">{subtitle}</p>}
            </div>
            <div className="lg:hidden">
              <ThemeButton />
            </div>
          </div>
        </header>
        <main className="kb-rise mx-auto max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-2 md:px-8 lg:pb-16">
          {children}
        </main>
      </div>

      {/* ── Barra de abas (celular) ─────────────────── */}
      <nav aria-label="Navegação principal" className="kb-tabbar flex gap-1 lg:hidden">
        {groups.map((g) =>
          g.links.length === 1 ? (
            <Link
              key={g.id}
              href={g.links[0].href}
              aria-current={activeGroup === g.id ? "page" : undefined}
              className="kb-tab"
            >
              {g.icon}
              {g.label}
            </Link>
          ) : (
            <button
              key={g.id}
              type="button"
              aria-expanded={sheet === g.id}
              aria-current={activeGroup === g.id && sheet !== g.id ? "page" : undefined}
              onClick={() => setSheet(sheet === g.id ? null : g.id)}
              className="kb-tab"
            >
              {g.icon}
              {g.label}
            </button>
          )
        )}
      </nav>

      {/* ── Bottom sheet do grupo (celular) ─────────── */}
      <div
        aria-hidden={!openGroup}
        onClick={() => setSheet(null)}
        className={`fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          openGroup ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-label={openGroup?.label ?? "Menu"}
        className={`kb-sheet lg:hidden ${openGroup ? "translate-y-0" : "pointer-events-none translate-y-full"}`}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--kb-line-strong)]" />
        <p className="kb-faint mb-2 px-3 text-xs">{openGroup?.id === "ajustes" ? "Ajustes" : openGroup?.label}</p>
        <div className="flex flex-col gap-1">
          {openGroup?.links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l) ? "page" : undefined} className="kb-nav-link min-h-[52px]! text-base!">
              {l.label}
            </Link>
          ))}
          {openGroup?.id === "ajustes" && (
            <button type="button" onClick={logout} className="kb-nav-link min-h-[52px]! text-base!">
              Sair · {user.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
