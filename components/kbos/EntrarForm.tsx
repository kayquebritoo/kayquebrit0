"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "magic" | "define";

export default function EntrarForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") || "";
  const urlToken = params.get("token") || "";

  const [mode, setMode] = useState<Mode>(urlToken ? "define" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [name, setName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [token, setToken] = useState(urlToken);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_PASSWORD") {
          setMsg({ ok: false, text: data.error });
          setMode("magic");
          return;
        }
        throw new Error(data.error || "Falha ao entrar.");
      }
      router.replace(next && next.startsWith("/") ? next : data.dest || "/portal");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
    }
  }

  async function doMagic(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar.");
      if (data.devLink) setDevLink(data.devLink);
      setMsg({
        ok: true,
        text: data.emailEnviado
          ? "Link enviado! Abra o e-mail para entrar — depois defina sua senha em “Definir senha”."
          : "Provedor de e-mail indisponível no momento — tente a senha ou fale com o administrador.",
      });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
    }
  }

  async function doDefine(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const qs = email ? `?email=${encodeURIComponent(email)}` : "";
      const res = await fetch(`/api/auth/password${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { password: newPass, token } : { password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar senha.");
      setMsg({ ok: true, text: "Senha salva! Entre com e-mail e senha." });
      setMode("login");
      setPassword("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] outline-none placeholder:text-white/25 focus:border-white/50";

  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#0B0B1E] px-4 py-10 text-[#F4F1EC] sm:px-5">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur sm:p-8">
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">KBOS · Portal do Cliente</p>
        <h1 className="font-display mt-2 text-3xl font-light">Entrar</h1>
        <p className="mt-2 text-sm font-light text-white/60">
          Acesse com seu e-mail e senha.
        </p>

        {params.get("erro") === "link" && (
          <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">
            Esse link expirou ou já foi usado. Entre com sua senha ou peça um novo abaixo.
          </p>
        )}

        {/* abas */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-black/30 p-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {(
            [
              { id: "login", label: "Senha" },
              { id: "magic", label: "Link mágico" },
              { id: "define", label: "Definir senha" },
            ] as { id: Mode; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); setMsg(null); setDevLink(null); }}
              aria-pressed={mode === t.id}
              className={`rounded-full px-2 py-2 transition ${
                mode === t.id ? "bg-white text-black" : "text-white/55 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === "login" && (
          <form onSubmit={doLogin} className="mt-5">
            <label htmlFor="email" className="block text-[12px] uppercase tracking-[0.2em] text-white/50">
              E-mail
            </label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
              className={inputCls}
            />
            <label htmlFor="pass" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
              Senha
            </label>
            <div className="relative">
              <input
                id="pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Sua senha (admin: token da VPS)"
                className={`${inputCls} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 hover:text-white"
              >
                {showPass ? "Ocultar" : "Ver"}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full bg-white py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}

        {mode === "magic" && (
          <form onSubmit={doMagic} className="mt-5">
            <p className="text-sm font-light text-white/60">
              Receba um link de acesso no e-mail (recuperação / primeiro acesso).
            </p>
            <label htmlFor="m-name" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
              Nome <span className="normal-case tracking-normal text-white/30">(opcional)</span>
            </label>
            <input
              id="m-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              className={inputCls}
            />
            <label htmlFor="m-email" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
              E-mail
            </label>
            <input
              id="m-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="voce@email.com"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full border border-white/40 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white hover:text-black disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}

        {mode === "define" && (
          <form onSubmit={doDefine} className="mt-5">
            <p className="text-sm font-light text-white/60">
              {token
                ? "Defina sua nova senha com o token do e-mail."
                : "Já entrou pelo link mágico? Defina sua senha aqui (mín. 8 caracteres)."}
            </p>
            {!token && (
              <>
                <label htmlFor="d-email" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
                  E-mail
                </label>
                <input
                  id="d-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="voce@email.com"
                  className={inputCls}
                />
              </>
            )}
            {urlToken || token ? (
              <>
                <label htmlFor="d-token" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
                  Token do e-mail
                </label>
                <input
                  id="d-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole o token (hex do link)"
                  autoComplete="off"
                  className={inputCls}
                />
              </>
            ) : null}
            <label htmlFor="d-pass" className="mt-4 block text-[12px] uppercase tracking-[0.2em] text-white/50">
              Nova senha
            </label>
            <input
              id="d-pass"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full bg-white py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar senha"}
            </button>
          </form>
        )}

        {msg && (
          <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
        )}
        {devLink && (
          <a
            href={devLink}
            className="mt-3 block rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-center text-sm text-amber-200"
          >
            Modo dev — entrar agora →
          </a>
        )}
        <Link
          href="/"
          className="mt-6 block text-center text-[12px] uppercase tracking-[0.25em] text-white/40 hover:text-white"
        >
          ← Voltar ao site
        </Link>
      </div>
    </main>
  );
}
