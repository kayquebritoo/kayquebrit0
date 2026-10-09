"use client";
import { useEffect, useRef, useState } from "react";

type Status = {
  configured: boolean;
  instance: string;
  state: "open" | "connecting" | "close" | "unknown";
  qrcode: string | null;
  pairingCode: string | null;
  detail?: string;
  error?: string;
  checkedAt?: string;
};

const STATE_STYLE: Record<string, { dot: string; label: string }> = {
  open: { dot: "bg-emerald-400", label: "Conectado" },
  connecting: { dot: "bg-amber-300", label: "Aguardando escaneamento" },
  close: { dot: "bg-rose-400", label: "Desconectado" },
  unknown: { dot: "bg-white/30", label: "Indisponível" },
};

const POLL_MS = 5000;
const QR_TTL_MS = 45_000; // QR expira em ~60s: renova sozinho aos 45s

async function fetchStatus(withQr: boolean): Promise<Status> {
  const res = await fetch(`/api/admin/whatsapp${withQr ? "?qr=1" : ""}`);
  const data = await res.json();
  if (!res.ok && res.status !== 503) throw new Error(data.error || "Falha.");
  return data;
}

export default function WhatsappConnect() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const qrAt = useRef(0);

  // Montagem: status + QR fresco. Depois, status a cada 5s (para ao conectar);
  // QR renova sozinho antes de expirar.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const apply = (d: Status, freshQr: boolean) => {
      if (!alive) return false;
      setData(d);
      if (freshQr && d.qrcode) qrAt.current = Date.now();
      return true;
    };
    (async () => {
      try {
        const d = await fetchStatus(true);
        if (!apply(d, true)) return;
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Erro.");
        return;
      }
      if (!alive) return;
      timer = setInterval(async () => {
        const s = await fetchStatus(false).catch(() => null);
        if (!s || !alive) return;
        // status-only não traz QR: preserva o atual
        setData((prev) => ({
          ...s,
          qrcode: prev?.qrcode ?? null,
          pairingCode: prev?.pairingCode ?? null,
        }));
        if (s.state === "open") {
          stop();
          return;
        }
        if (s.configured && Date.now() - qrAt.current > QR_TTL_MS) {
          const f = await fetchStatus(true).catch(() => null);
          if (f && alive && f.qrcode) {
            qrAt.current = Date.now();
            setData(f);
          }
        }
      }, POLL_MS);
    })();
    return () => {
      alive = false;
      stop();
    };
  }, []);

  async function action(kind: "refresh" | "restart" | "logout") {
    if (busy) return;
    if (
      (kind === "restart" || kind === "logout") &&
      !confirm(
        kind === "restart"
          ? "Reiniciar a instância do WhatsApp?"
          : "Desvincular o WhatsApp desta instância? Será preciso escanear de novo."
      )
    ) {
      return;
    }
    setBusy(kind);
    setError("");
    try {
      if (kind !== "refresh") {
        const res = await fetch("/api/admin/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha.");
      }
      const d = await fetchStatus(true);
      setData(d);
      if (d.qrcode) qrAt.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(null);
    }
  }

  if (!data && !error) {
    return <p className="animate-pulse text-sm uppercase tracking-[0.3em] text-white/40">Consultando Evolution...</p>;
  }

  if (data && !data.configured) {
    return (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 text-sm text-amber-100">
        <p className="font-semibold">Evolution API não configurada</p>
        <p className="mt-2 font-light leading-relaxed text-amber-100/80">
          Defina <code>EVOLUTION_API_URL</code>, <code>EVOLUTION_API_KEY</code> e{" "}
          <code>EVOLUTION_INSTANCE</code> no ambiente da VPS. {data.error}
        </p>
      </div>
    );
  }

  const st = STATE_STYLE[data?.state ?? "unknown"] ?? STATE_STYLE.unknown;

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">Escaneie com o WhatsApp Business</p>
          {data?.state === "open" ? (
            <div className="py-10">
              <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-2xl text-emerald-200" aria-hidden>✓</p>
              <p className="mt-4 text-white/80">Sessão ativa — nada a fazer.</p>
            </div>
          ) : data?.qrcode ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qrcode} alt="QR code de conexão do WhatsApp" className="mx-auto mt-5 h-64 w-64 rounded-2xl border border-white/15 bg-white p-2" />
              <p className="mt-3 text-[12px] font-light text-white/45">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              {data.pairingCode && (
                <p className="mt-2 font-mono text-sm tracking-[0.2em] text-white/70">{data.pairingCode}</p>
              )}
            </>
          ) : (
            <div className="py-10">
              <p className="animate-pulse text-sm text-white/50">Gerando QR code...</p>
              {data?.detail && <p className="mt-2 text-[12px] text-white/40">{data.detail}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">Status</p>
            <p className="mt-3 flex items-center gap-2.5 text-lg">
              <span className={`h-3 w-3 rounded-full ${st.dot}`} aria-hidden />
              {st.label}
            </p>
            <p className="mt-2 font-mono text-[12px] text-white/45">instância: {data?.instance}</p>
            {data?.checkedAt && (
              <p className="mt-1 text-[12px] font-light text-white/35">
                verificado às {new Date(data.checkedAt).toLocaleTimeString("pt-BR")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => action("refresh")} disabled={!!busy} className="rounded-xl bg-white py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:scale-[1.01] disabled:opacity-60">
              {busy === "refresh" ? "Atualizando..." : "Atualizar QR"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => action("restart")} disabled={!!busy} className="rounded-xl border border-white/25 py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:bg-white hover:text-black disabled:opacity-60">
                {busy === "restart" ? "..." : "Reiniciar"}
              </button>
              <button onClick={() => action("logout")} disabled={!!busy} className="rounded-xl border border-rose-300/40 py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-rose-200 transition hover:bg-rose-300 hover:text-black disabled:opacity-60">
                {busy === "logout" ? "..." : "Desvincular"}
              </button>
            </div>
          </div>
          <p className="text-[12px] font-light leading-relaxed text-white/40">
            O status atualiza sozinho a cada 5 segundos e o QR se renova antes de expirar. Ao conectar, o polling para automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
