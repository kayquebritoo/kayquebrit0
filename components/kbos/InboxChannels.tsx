"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Wa = { configured: boolean; state: string };
type Tg = {
  configured: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  detail?: string;
};

const dot = (on: boolean, warn = false) =>
  `h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-400" : warn ? "bg-amber-300" : "bg-white/25"}`;

const card =
  "flex min-w-[240px] flex-1 snap-start flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25";

export default function InboxChannels() {
  const [wa, setWa] = useState<Wa | null>(null);
  const [tg, setTg] = useState<Tg | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([
        fetch("/api/admin/whatsapp").then((r) => r.json().catch(() => null)),
        fetch("/api/channels/telegram").then((r) => r.json().catch(() => null)),
      ]);
      if (w && typeof w.configured === "boolean") setWa(w);
      if (t && typeof t.configured === "boolean") setTg(t);
    } catch {
      /* barra de canais é auxiliar — o board abaixo sinaliza o banco */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function tgAction(action: "connect" | "disconnect") {
    setBusy(action);
    setMsg("");
    try {
      const res = await fetch("/api/channels/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha.");
      setTg(data);
      setMsg(action === "connect" ? "Telegram conectado — mande um oi p/ o bot." : "Telegram desconectado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(null);
    }
  }

  const waOn = !!wa?.configured && wa.state === "open";
  const tgOn = !!tg?.configured && !!tg.webhookUrl;

  return (
    <div className="mb-4">
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {/* WhatsApp — status real da Evolution */}
        <div className={card}>
          <div className="flex items-center gap-2.5">
            <span className={dot(waOn, !!wa?.configured)} aria-hidden />
            <p className="text-sm font-semibold">✆ WhatsApp</p>
            <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-white/45">
              {!wa ? "…" : !wa.configured ? "não configurado" : waOn ? "conectado" : wa.state}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-white/50">
            {waOn ? "Mensagens caem aqui via webhook da Evolution." : "Conecte o número para receber no inbox."}
          </p>
          <Link
            href="/admin/whatsapp"
            className="mt-auto rounded-xl border border-white/15 py-2 text-center text-[12px] font-bold uppercase tracking-[0.12em] text-white/80 transition hover:bg-white hover:text-black active:scale-[0.99]"
          >
            {waOn ? "Ver conexão" : "Conectar número"}
          </Link>
        </div>

        {/* Telegram — conexão real via Bot API (só token, sem QR) */}
        <div className={card}>
          <div className="flex items-center gap-2.5">
            <span className={dot(tgOn, !!tg?.configured)} aria-hidden />
            <p className="text-sm font-semibold">➤ Telegram {tg?.botUsername ? <span className="font-normal text-white/50">{tg.botUsername}</span> : ""}</p>
            <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-white/45">
              {!tg ? "…" : tgOn ? "conectado" : tg.configured ? "token ok" : "desligado"}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-white/50">
            {!tg?.configured
              ? "Crie o bot com o @BotFather e defina TELEGRAM_BOT_TOKEN no .env da VPS."
              : tgOn
                ? "Updates chegando via webhook. Pode conversar por aqui."
                : "Token pronto — clique em Conectar p/ registrar o webhook."}
          </p>
          <div className="mt-auto flex gap-2">
            {!tgOn ? (
              <button
                onClick={() => tgAction("connect")}
                disabled={busy === "connect" || !tg?.configured}
                title={!tg?.configured ? "Defina TELEGRAM_BOT_TOKEN primeiro" : "Registrar webhook"}
                className="flex-1 rounded-xl bg-white py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-40"
              >
                {busy === "connect" ? "…" : "Conectar"}
              </button>
            ) : (
              <button
                onClick={() => tgAction("disconnect")}
                disabled={busy === "disconnect"}
                className="flex-1 rounded-xl border border-white/15 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10 active:scale-[0.99] disabled:opacity-40"
              >
                {busy === "disconnect" ? "…" : "Desconectar"}
              </button>
            )}
          </div>
        </div>

        {/* Instagram / Messenger — roadmap honesto (exigem Meta App + OAuth) */}
        {[
          { icon: "◍", name: "Instagram", need: "Meta App + login do perfil comercial" },
          { icon: "☁", name: "Messenger", need: "Meta App + página do Facebook vinculada" },
        ].map((c) => (
          <div key={c.name} className={`${card} opacity-70`}>
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white/25" aria-hidden />
              <p className="text-sm font-semibold">{c.icon} {c.name}</p>
              <span className="ml-auto text-[11px] uppercase tracking-[0.12em] text-white/45">em breve</span>
            </div>
            <p className="text-[12px] leading-relaxed text-white/50">
              Para ligar: {c.need}. A estrutura do inbox já aceita o canal.
            </p>
            <span className="mt-auto rounded-xl border border-white/10 py-2 text-center text-[12px] uppercase tracking-[0.12em] text-white/35">
              Aguardando integração
            </span>
          </div>
        ))}
      </div>
      {msg && <p className="mt-2 text-[13px] text-white/60">{msg}</p>}
    </div>
  );
}
