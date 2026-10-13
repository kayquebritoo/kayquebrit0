"use client";
import { useEffect, useRef, useState } from "react";

type Status = {
  configured: boolean;
  instance: string;
  state: "open" | "connecting" | "close" | "unknown";
  qrcode: string | null;
  pairingCode: string | null;
  created?: boolean;
  usingDefaultKey?: boolean;
  fallback?: boolean;
  webhook?: { ok: boolean; url: string | null } | null;
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

async function fetchStatus(withQr: boolean, phone?: string): Promise<Status> {
  const params = withQr ? `?qr=1${phone ? `&phone=${encodeURIComponent(phone)}` : ""}` : "";
  const res = await fetch(`/api/admin/whatsapp${params}`);
  const data = await res.json();
  if (!res.ok && res.status !== 503) throw new Error(data.error || "Falha.");
  return data;
}

export default function WhatsappConnect() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState("");
  // Número para o qual o código exibido foi gerado (transparência anti-stale).
  const [codeFor, setCodeFor] = useState("");
  // Aviso quando a API responde sem pairing code após pedido explícito.
  const [noCode, setNoCode] = useState(false);
  const qrAt = useRef(0);
  const phoneRef = useRef("");
  const modeRef = useRef<"qr" | "phone">("qr");
  // Espelha estado nos refs p/ o polling (fora do render, sem recriar timers).
  useEffect(() => {
    phoneRef.current = phone.replace(/\D/g, "");
    modeRef.current = mode;
  });

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
        // status-only não traz QR/webhook: preserva os atuais
        setData((prev) => ({
          ...s,
          qrcode: prev?.qrcode ?? null,
          pairingCode: prev?.pairingCode ?? null,
          webhook: s.webhook ?? prev?.webhook ?? null,
        }));
        if (s.state === "open") {
          stop();
          return;
        }
        if (s.configured && Date.now() - qrAt.current > QR_TTL_MS) {
          // Renova QR ou código com o modo atual (código expira como o QR).
          const f = await fetchStatus(true, modeRef.current === "phone" ? phoneRef.current : "").catch(() => null);
          if (f && alive && (f.qrcode || f.pairingCode)) {
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

  async function action(kind: "refresh" | "restart" | "logout" | "pairing") {
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
    if (kind === "pairing") {
      // Lê o state direto (nunca ref desatualizado) e valida antes de chamar.
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        setError("Informe o número com DDI+DDD (10–15 dígitos) para gerar o código.");
        return;
      }
    }
    setBusy(kind);
    setError("");
    if (kind === "pairing") setNoCode(false);
    try {
      if (kind === "restart" || kind === "logout") {
        const res = await fetch("/api/admin/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Falha.");
      }
      // Pedido explícito de pareamento usa o número digitado; refresh em modo
      // telefone reutiliza o último número.
      const withPhone =
        kind === "pairing" ? phone.replace(/\D/g, "") : modeRef.current === "phone" ? phoneRef.current : "";
      const d = await fetchStatus(true, withPhone);
      setData(d);
      if (d.qrcode || d.pairingCode) qrAt.current = Date.now();
      if (kind === "pairing") {
        if (d.pairingCode) {
          setCodeFor(withPhone);
        } else {
          // Resposta sem código após pedido explícito: não deixa parado no
          // "aguardando" — explica (backend antigo sem ?phone= é a causa #1).
          setNoCode(true);
        }
      }
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
          <code>EVOLUTION_INSTANCE</code> no ambiente da VPS e recrie os containers{" "}
          (<code>up -d --build</code>). {data.error}
        </p>
        <p className="mt-2 font-light leading-relaxed text-amber-100/60">
          Atalho: com o compose atualizado, basta <code>EVOLUTION_API_KEY</code> (a URL{" "}
          <code>http://evolution:8080</code> e a instância <code>kbos-primary</code> já vêm por padrão).
        </p>
      </div>
    );
  }

  const st = STATE_STYLE[data?.state ?? "unknown"] ?? STATE_STYLE.unknown;

  return (
    <div>
      {data?.usingDefaultKey && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">
          Chave padrão de desenvolvimento em uso (<code>kbos-dev-key</code>). Funciona, mas defina uma{" "}
          <code>EVOLUTION_API_KEY</code> forte no <code>/opt/kbos/.env</code> e rode{" "}
          <code>up -d --build</code> para endurecer a produção.
        </div>
      )}
      {data?.fallback && !data?.usingDefaultKey && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">
          Zero-config ativo: variáveis <code>EVOLUTION_*</code> ausentes no ambiente — usando padrões internos{" "}
          (<code>http://evolution:8080</code> + <code>kbos-primary</code>). Para produção, defina as chaves no{" "}
          <code>/opt/kbos/.env</code> e recrie com <code>up -d --build</code>.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">
            {mode === "phone" ? "Conecte com o número de telefone" : "Escaneie com o WhatsApp Business"}
          </p>
          {data?.state === "open" ? (
            <div className="py-10">
              <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-2xl text-emerald-200" aria-hidden>✓</p>
              <p className="mt-4 text-white/80">Sessão ativa — nada a fazer.</p>
            </div>
          ) : mode === "phone" ? (
            <div className="mt-5">
              <label htmlFor="wa-phone" className="block text-[11px] uppercase tracking-[0.2em] text-white/50">
                Número com DDI + DDD
              </label>
              <input
                id="wa-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ex.: 5591999998888"
                className="mx-auto mt-2 w-full max-w-[280px] rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-[15px] tracking-[0.1em] outline-none placeholder:text-white/25 focus:border-white/50"
              />
              <button
                onClick={() => action("pairing")}
                disabled={!!busy}
                className="mx-auto mt-3 block w-full max-w-[280px] rounded-xl bg-white py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:scale-[1.01] disabled:opacity-60"
              >
                {busy === "pairing" ? "Gerando..." : "Gerar código de pareamento"}
              </button>
              {busy === "pairing" ? (
                <div className="py-6">
                  <p className="animate-pulse text-sm text-white/70">Gerando código...</p>
                  <p className="mt-2 text-[12px] font-light text-white/40">Consultando a Evolution API…</p>
                </div>
              ) : data?.pairingCode ? (
                <div className="mx-auto mt-5 max-w-[320px] rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.07] p-5">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Digite no celular</p>
                  <p className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-emerald-200">{data.pairingCode}</p>
                  {codeFor && (
                    <p className="mt-1 font-mono text-[12px] text-white/45">código para +{codeFor}</p>
                  )}
                  <ol className="mx-auto mt-4 max-w-[260px] list-decimal space-y-1.5 pl-5 text-left text-[13px] font-light leading-relaxed text-white/70">
                    <li>Abra o WhatsApp no celular.</li>
                    <li>Toque em <strong className="font-semibold">Aparelhos conectados</strong>.</li>
                    <li>Toque em <strong className="font-semibold">Conectar aparelho</strong> e escolha <strong className="font-semibold">Conectar com número de telefone</strong>.</li>
                    <li>Digite o código acima (vale ~1 min — renova sozinho).</li>
                  </ol>
                </div>
              ) : (
                <div className="py-6">
                  <p className="animate-pulse text-sm text-white/50">Aguardando número para gerar o código...</p>
                  {data?.detail && <p className="mt-2 text-[12px] text-white/40">{data.detail}</p>}
                  {noCode && (
                    <div className="mx-auto mt-3 max-w-[320px] rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-left text-[12px] font-light leading-relaxed text-amber-100/90">
                      A API respondeu sem código de pareamento. Causa mais comum: backend desatualizado
                      (sem suporte a <code>?phone=</code>) — confira se o deploy mais recente vestiu, ou use o QR Code.
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => { setMode("qr"); setError(""); setNoCode(false); action("refresh"); }}
                disabled={!!busy}
                className="mt-4 text-[12px] uppercase tracking-[0.2em] text-white/45 underline-offset-4 hover:text-white hover:underline disabled:opacity-60"
              >
                ← Voltar ao QR Code
              </button>
            </div>
          ) : data?.qrcode ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qrcode} alt="QR code de conexão do WhatsApp" className="mx-auto mt-5 h-64 w-64 rounded-2xl border border-white/15 bg-white p-2" />
              <p className="mt-3 text-[12px] font-light text-white/45">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              {data.pairingCode && (
                <p className="mt-2 font-mono text-sm tracking-[0.2em] text-white/70">{data.pairingCode}</p>
              )}
              <button
                onClick={() => { setMode("phone"); setError(""); setNoCode(false); }}
                disabled={!!busy}
                className="mx-auto mt-4 block rounded-full border border-white/25 px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 transition hover:border-white/60 hover:text-white disabled:opacity-60"
              >
                Conectar com número de telefone
              </button>
            </>
          ) : (
            <div className="py-10">
              <p className="animate-pulse text-sm text-white/50">Gerando QR code...</p>
              {data?.detail && <p className="mt-2 text-[12px] text-white/40">{data.detail}</p>}
              <button
                onClick={() => { setMode("phone"); setError(""); setNoCode(false); }}
                disabled={!!busy}
                className="mx-auto mt-4 block rounded-full border border-white/25 px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 transition hover:border-white/60 hover:text-white disabled:opacity-60"
              >
                Conectar com número de telefone
              </button>
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
            {data?.created && (
              <p className="mt-1 text-[12px] font-light text-emerald-200/80">
                Instância criada agora com escuta ativa — escaneie o QR.
              </p>
            )}
            {data?.webhook && (
              <p className="mt-1 flex items-center gap-1.5 text-[12px] font-light">
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${data.webhook.ok ? "bg-emerald-400" : "bg-amber-300"}`}
                />
                <span className={data.webhook.ok ? "text-white/60" : "text-amber-200/90"}>
                  {data.webhook.ok ? "Escuta de mensagens ativa" : "Escuta inativa — será reparada no próximo refresh"}
                </span>
              </p>
            )}
            {data?.checkedAt && (
              <p className="mt-1 text-[12px] font-light text-white/35">
                verificado às {new Date(data.checkedAt).toLocaleTimeString("pt-BR")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => action("refresh")} disabled={!!busy} className="rounded-xl bg-white py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:scale-[1.01] disabled:opacity-60">
              {busy === "refresh" ? "Atualizando..." : mode === "phone" ? "Atualizar código" : "Atualizar QR"}
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
            O status atualiza sozinho a cada 5 segundos e o QR/código se renova antes de expirar. Ao conectar, o polling para automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
