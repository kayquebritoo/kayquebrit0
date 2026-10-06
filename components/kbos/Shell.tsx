"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// Guard client-side (funciona no export estático e no server):
// sem sessão -> /entrar; área admin exige role admin.
export function KbosShell({
  children,
  title,
  admin,
}: {
  children: React.ReactNode;
  title: string;
  admin?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);

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

  return (
    <main className="min-h-screen bg-[#0B0B1E] px-5 pb-20 pt-24 text-[#F4F1EC] md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">KBOS</p>
            <h1 className="font-display mt-1 text-2xl font-light md:text-3xl">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.15em]">
              <Link href="/portal" className="rounded-full border border-white/15 px-4 py-2 text-white/70 hover:text-white">Portal</Link>
              {user.role !== "cliente" && (
                <Link href="/admin/projetos" className="rounded-full border border-white/15 px-4 py-2 text-white/70 hover:text-white">Projetos</Link>
              )}
              {user.role === "admin" && (
                <>
                  <Link href="/admin/financeiro" className="rounded-full border border-white/15 px-4 py-2 text-white/70 hover:text-white">Financeiro</Link>
                  <Link href="/admin/briefings" className="rounded-full border border-white/15 px-4 py-2 text-white/70 hover:text-white">Briefings</Link>
                </>
              )}
            </nav>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-white/70">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
            <button onClick={logout} className="text-[12px] uppercase tracking-[0.15em] text-white/50 hover:text-white">
              Sair
            </button>
          </div>
        </header>
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
