"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function EntrarForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ ok?: boolean; sent?: boolean; msg?: string; devLink?: string; loading?: boolean }>({});

export default function EntrarForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<{ ok?: boolean; msg?: string; devLink?: string; loading?: boolean }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ loading: true });
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar.");
      setState({
        ok: true,
        sent: data.emailEnviado,
        msg: data.emailEnviado
          ? "Link enviado! Confira seu e-mail (vale 15 min)."
          : "E-mail de acesso ainda não configurado — peça seu link ao administrador.",
        devLink: data.devLink,
      });
    } catch (err) {
      setState({ msg: err instanceof Error ? err.message : "Erro inesperado." });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] px-5 text-[#F4F1EC]">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">KBOS · Portal do Cliente</p>
        <h1 className="font-display mt-2 text-3xl font-light">Entrar sem senha</h1>
        {params.get("erro") === "link" && (
          <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">
            Esse link expirou ou já foi usado. Peça um novo abaixo.
          </p>
        )}
        <p className="mt-2 text-sm font-light text-white/60">
          Digite seu e-mail e enviamos um link mágico de acesso.
        </p>
        <label className="mt-6 block text-[12px] uppercase tracking-[0.2em] text-white/50">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] outline-none placeholder:text-white/25 focus:border-white/50"
        />
        <label className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">E-mail</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="voce@email.com"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] outline-none placeholder:text-white/25 focus:border-white/50"
        />
        <button
          type="submit"
          disabled={state.loading}
          className="mt-6 w-full rounded-full bg-white py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02] disabled:opacity-60"
        >
          {state.loading ? "Enviando..." : "Enviar link"}
        </button>
        {state.msg && (
          <p className={`mt-4 text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.msg}</p>
        )}
        {state.devLink && (
          <a href={state.devLink} className="mt-3 block rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-center text-sm text-amber-200">
            Modo dev — entrar agora →
          </a>
        )}
        <Link href="/" className="mt-6 block text-center text-[12px] uppercase tracking-[0.25em] text-white/40 hover:text-white">
          ← Voltar ao site
        </Link>
      </form>
    </main>
  );
}
