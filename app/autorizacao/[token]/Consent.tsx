"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import PageBackdrop from "@/components/PageBackdrop";

type Preview = {
  title: string;
  category: string;
  description: string;
  img: string;
  client: string;
  year: string;
  videoId?: string;
  metrics?: string;
  testimonial?: { text: string; author: string };
};
type View = {
  status: string;
  expired: boolean;
  scopes: { id: string; label: string }[];
  granted: string[];
  preview: Preview;
  signerName: string | null;
  decidedAt: string | null;
  expiresAt: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export default function Consent({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await fetch(`/api/consent/${token}/`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Link não encontrado.");
      setView(j as View);
      setPicked(new Set((j as View).scopes.map((s) => s.id)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link não encontrado.");
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function send(action: "grant" | "decline" | "revoke") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/consent/${token}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, scopes: [...picked], signerName: name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não consegui registrar. Tente de novo.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui registrar.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pending = view?.status === "pending" && !view.expired;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#11101E] px-5 pb-20 pt-16 text-[#EDE6EC]">
      <PageBackdrop />
      <div className="relative z-10 mx-auto max-w-xl">
        <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">Autorização de portfólio</p>

        {!view && !error && <div className="mt-8 h-72 animate-pulse rounded-3xl bg-white/[0.05]" />}
        {!view && error && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6" role="alert">
            <p className="font-display text-2xl font-light">Este link não está disponível.</p>
            <p className="mt-2 text-sm font-light text-white/60">{error} Fale com o Kayque para receber um novo.</p>
          </div>
        )}

        {view && (
          <>
            <h1 className="font-display mt-3 text-balance text-3xl font-light leading-tight md:text-5xl">
              Posso mostrar esse projeto no meu <em className="kb-em">portfólio</em>?
            </h1>
            <p className="mt-3 text-[15px] font-light leading-relaxed text-white/60">
              Veja como vai ficar e escolha o que você libera. Você pode mudar de ideia depois, por este mesmo link.
            </p>

            <article className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
              {view.preview.img && (
                <div className="relative aspect-[16/10]">
                  <Image src={view.preview.img} alt={view.preview.title} fill unoptimized className="object-cover" sizes="(max-width:768px) 100vw, 576px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                </div>
              )}
              <div className="p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                  {view.preview.category}
                  {view.preview.year ? ` · ${view.preview.year}` : ""}
                </p>
                <h2 className="font-display mt-1 text-2xl font-bold leading-tight">{view.preview.title}</h2>
                <p className="mt-1 text-sm text-[#B79BFF]">{view.preview.client}</p>
                <p className="mt-3 text-sm font-light leading-relaxed text-white/70">{view.preview.description}</p>
                {view.preview.metrics && (
                  <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80">{view.preview.metrics}</p>
                )}
                {view.preview.testimonial && (
                  <blockquote className="mt-3 border-l-2 border-[#4F12C7] pl-4 text-sm font-light italic text-white/70">
                    “{view.preview.testimonial.text}”
                    {view.preview.testimonial.author && <footer className="mt-1 text-xs not-italic text-white/45">{view.preview.testimonial.author}</footer>}
                  </blockquote>
                )}
              </div>
            </article>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}

            {pending && (
              <section className="mt-6" aria-label="O que você libera">
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/45">O que você libera</p>
                <div className="mt-3 flex flex-col gap-2">
                  {view.scopes.map((s) => (
                    <label key={s.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[15px] active:scale-[0.99]">
                      <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="h-5 w-5 accent-[#4F12C7]" />
                      {s.label}
                    </label>
                  ))}
                </div>
                <label className="mt-5 block text-[11px] uppercase tracking-[0.28em] text-white/45">
                  Seu nome
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Nome de quem autoriza"
                    className="mt-2 block w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3.5 text-base normal-case tracking-normal text-[#EDE6EC] outline-none placeholder:text-white/30 focus:border-white/50"
                  />
                </label>
                <div className="mt-5 flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={busy || picked.size === 0 || name.trim().length < 2}
                    onClick={() => send("grant")}
                    className="min-h-12 rounded-full bg-white px-8 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-black transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {busy ? "Registrando…" : "Autorizo"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send("decline")}
                    className="min-h-12 rounded-full border border-white/20 px-8 py-3.5 text-sm uppercase tracking-[0.16em] text-white/70 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    Prefiro não
                  </button>
                </div>
                <p className="mt-4 text-xs font-light leading-relaxed text-white/40">
                  Ao autorizar, registro seu nome, a data e os itens que você marcou. Este link vale até {fmt(view.expiresAt)}.
                </p>
              </section>
            )}

            {view.status === "pending" && view.expired && (
              <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">Este pedido expirou. Fale com o Kayque para receber um novo link.</p>
            )}
            {view.status === "superseded" && (
              <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">Existe um pedido mais novo para este projeto. Use o link mais recente que o Kayque enviou.</p>
            )}
            {view.status === "declined" && (
              <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">Tudo bem! Registrei que você prefere não aparecer. O projeto não será publicado.</p>
            )}
            {view.status === "revoked" && (
              <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">Autorização revogada{view.decidedAt ? ` em ${fmt(view.decidedAt)}` : ""}. O projeto saiu do ar.</p>
            )}
            {view.status === "granted" && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="font-display text-xl font-light">Obrigado{view.signerName ? `, ${view.signerName.split(" ")[0]}` : ""}!</p>
                <p className="mt-2 text-sm font-light text-white/65">
                  Autorizado em {view.decidedAt ? fmt(view.decidedAt) : "—"}: {view.granted.length ? view.scopes.filter((s) => view.granted.includes(s.id)).map((s) => s.label.toLowerCase()).join(", ") : "nenhum item"}.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send("revoke")}
                  className="mt-4 min-h-12 rounded-full border border-white/20 px-6 py-3 text-xs uppercase tracking-[0.16em] text-white/70 transition active:scale-[0.98] disabled:opacity-40"
                >
                  Revogar autorização
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
