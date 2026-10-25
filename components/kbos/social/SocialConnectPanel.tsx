"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NETS, NetMark, connectHref, netInfo, returnMessage, type ProviderInfo, type SocialAccount } from "./networks";

type Project = { id: string; titulo: string };
type Data = { providers: ProviderInfo[]; items: SocialAccount[]; projects?: Project[]; project?: string; expiresAt?: string };

/**
 * "Suas redes sociais": um botão grande por rede, o status de cada uma e as contas escolhidas.
 * Mesmo painel no portal (cliente logado) e no link de conexão (sem login, `token`).
 */
export default function SocialConnectPanel({ token }: { token?: string }) {
  const api = token ? `/api/public/social-connect/${token}/` : "/api/portal/social/";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(api, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !j) { setError(j?.error || "Não consegui carregar suas redes agora."); return; }
    setError(""); setData(j);
    setProject((p) => p || j.projects?.[0]?.id || "");
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mensagem da volta do login da rede
    setMsg(returnMessage(new URLSearchParams(window.location.search)));
    void load();
  }, [load]);

  const projects = data?.projects ?? [];
  const byNet = useMemo(() => {
    const m = new Map<string, SocialAccount[]>();
    for (const a of data?.items ?? []) {
      if (!token && projects.length > 1 && project && a.projectId !== project) continue;
      m.set(a.network, [...(m.get(a.network) ?? []), a]);
    }
    return m;
  }, [data, project, projects.length, token]);

  async function disconnect(a: SocialAccount) {
    if (!confirm(`Desconectar ${a.name} (${netInfo(a.network).label})? O KBOS para de publicar nessa conta e o acesso é revogado na rede.`)) return;
    setBusy(a.id);
    const r = await fetch(`${api}?id=${a.id}`, { method: "DELETE" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy("");
    setMsg(r?.ok ? (j.revoked === "manual" ? "Desconectado. No Pinterest, remova também o app KBOS em Configurações → Apps." : "Desconectado e acesso revogado na rede.") : j.error || "Não consegui desconectar.");
    await load();
  }

  async function move(a: SocialAccount, projectId: string) {
    const r = await fetch(api, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, projectId }) }).catch(() => null);
    setMsg(r?.ok ? "Salvo." : "Não consegui mudar a empresa.");
    await load();
  }

  if (error && !data) {
    return (
      <section className="kb-glass p-5" aria-label="Suas redes sociais" role="alert">
        <p className="font-display text-xl">Suas redes sociais</p>
        <p className="kb-muted mt-1 text-sm">{error}</p>
      </section>
    );
  }
  if (!data) return <div className="kb-skel h-72" aria-label="Carregando suas redes" />;
  if (!token && !projects.length) return null; // sem empresa para administrar, o card não aparece

  const providers = new Map(data.providers.map((p) => [p.id, p]));

  return (
    <section className="kb-glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="redes-titulo">
      <div aria-hidden className="kb-wave pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(79,18,199,.35),transparent_65%)]" />
      <div className="relative flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 id="redes-titulo" className="font-display text-2xl leading-tight">Suas redes sociais</h2>
          <p className="kb-muted text-sm leading-relaxed">
            Conecte para o KBOS publicar seus posts no horário combinado. O login é feito no site oficial de cada rede: o KBOS nunca vê sua senha, e você pode desconectar quando quiser.
          </p>
        </header>

        {!token && projects.length > 1 && (
          <label className="kb-field">
            <span className="kb-faint text-xs">Empresa</span>
            <select className="kb-control" value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
          </label>
        )}

        {msg && <p role="status" className="rounded-xl border border-[var(--kb-accent-line)] bg-[var(--kb-accent-soft)] px-3 py-2 text-sm">{msg}</p>}

        <ul className="grid gap-2.5 sm:grid-cols-2">
          {NETS.map((n) => {
            const p = providers.get(n.provider);
            const accounts = byNet.get(n.network) ?? [];
            const expired = accounts.some((a) => a.status !== "ativo");
            const on = p?.configured;
            const state = !on ? "Em breve" : expired ? "Reconectar" : accounts.length ? `Conectado${accounts.length > 1 ? ` · ${accounts.length}` : ""}` : "Não conectado";
            const href = on ? connectHref(n.provider, token ? { link: token } : { project }) : undefined;
            return (
              <li key={n.network}>
                <a
                  href={href}
                  aria-disabled={!on}
                  className={`group flex min-h-16 items-center gap-3 rounded-2xl border p-3 transition ${on ? "border-[var(--kb-line-strong)] bg-[var(--kb-chip)] hover:bg-[var(--kb-chip-hover)] active:scale-[.98]" : "pointer-events-none border-[var(--kb-line)] opacity-55"}`}
                >
                  <NetMark network={n.network} size={44} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{accounts.length && !expired ? n.label : `Conectar ${n.label}`}</b>
                    <small className={`block text-xs ${expired ? "text-[var(--kb-soon)]" : accounts.length ? "text-[var(--kb-good)]" : "kb-faint"}`}>{state}</small>
                  </span>
                  {on && <span aria-hidden className="kb-faint text-lg transition-transform group-hover:translate-x-0.5">→</span>}
                </a>
              </li>
            );
          })}
        </ul>

        {[...byNet.values()].flat().length > 0 && (
          <div className="flex flex-col">
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Contas conectadas</p>
            {[...byNet.values()].flat().map((a) => (
              <div key={a.id} className="kb-row flex-wrap gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto de perfil vinda da rede */}
                  {a.pictureUrl ? <img src={a.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" /> : <NetMark network={a.network} size={36} />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{a.name}{a.username ? ` · @${a.username}` : ""}</span>
                    <span className={`block text-xs ${a.status === "ativo" ? "kb-faint" : "text-[var(--kb-soon)]"}`}>{netInfo(a.network).label}{a.status !== "ativo" ? " · acesso venceu, toque na rede acima para reconectar" : ""}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {!token && projects.length > 1 && (
                    <select className="kb-control min-h-11 max-w-44" aria-label={`Empresa de ${a.name}`} value={a.projectId ?? ""} onChange={(e) => void move(a, e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                    </select>
                  )}
                  <button type="button" className="kb-btn-ghost min-h-11" disabled={busy === a.id} onClick={() => void disconnect(a)}>{busy === a.id ? "…" : "Desconectar"}</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="kb-faint text-xs leading-relaxed">
          Você também pode tirar o acesso pelo app de cada rede (Configurações → Apps e sites conectados). Pedimos só a permissão de publicar e ler o resultado dos posts.
        </p>
      </div>
    </section>
  );
}
