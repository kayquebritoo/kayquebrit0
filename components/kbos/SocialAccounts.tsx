"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConnectLinkButton from "@/components/kbos/social/ConnectLinkButton";
import { CONNECTABLE_NETS, NETS, NetMark, connectHref, netInfo, returnMessage, type ProviderInfo, type SocialAccount } from "@/components/kbos/social/networks";

type Project = { id: string; titulo: string; parentId?: string | null; categoria?: string };
type Audit = { id: string; action: string; provider: string | null; project: string | null; actorKind: string; actor: string | null; ip: string | null; scopes: string | null; detail: Record<string, unknown> | null; createdAt: string };
const PERSONAL = "Kayque Brito (pessoal)";
const ACTION: Record<string, string> = {
  conectar: "conectou",
  desconectar: "desconectou",
  "ligar-projeto": "mudou de cliente",
  "link-criado": "criou link",
  "link-cancelado": "cancelou link",
  "renovar-falhou": "renovação falhou",
  "cliente-pessoal": "criou cliente pessoal",
  agendar: "agendou publicação",
  publicar: "publicou na rede",
  "publicar-falhou": "publicação falhou",
};
const WHO: Record<string, string> = { admin: "Admin", cliente: "Cliente (portal)", link: "Cliente (link)", sistema: "KBOS" };
const OPTION: Record<string, string> = { meta: "9", youtube: "10", google: "10", tiktok: "11", pinterest: "12", linkedin: "13" };

/** Ajustes → Redes sociais: contas conectadas de todos os clientes, conectar por cliente, link de conexão e auditoria. */
export default function SocialAccounts() {
  const [items, setItems] = useState<SocialAccount[] | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([
      fetch("/api/admin/social/accounts/", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]);
    setItems(a?.items ?? []); setProviders(a?.providers ?? []);
    setProjects((p.items ?? []).filter((x: Project) => x.categoria === "social" || x.parentId || x.titulo === PERSONAL));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mensagem da volta do login da rede
    setMsg(returnMessage(new URLSearchParams(window.location.search)));
    void load();
  }, [load]);

  const personal = projects.find((p) => p.titulo === PERSONAL);
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; items: SocialAccount[] }>();
    for (const a of items ?? []) {
      const k = a.projectId ?? "";
      if (!m.has(k)) m.set(k, { title: a.project ?? "Sem cliente (não publica)", items: [] });
      m.get(k)!.items.push(a);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : 0));
  }, [items]);
  const targetName = projects.find((p) => p.id === target)?.titulo;

  async function assign(a: SocialAccount, projectId: string) {
    const r = await fetch("/api/admin/social/accounts/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, projectId: projectId || null }) });
    setMsg(r.ok ? "Salvo." : "Não consegui salvar."); await load();
  }
  async function remove(a: SocialAccount) {
    if (!confirm(`Desconectar ${a.name} (${netInfo(a.network).label})? Agendamentos dessa conta param e o acesso é revogado na rede.`)) return;
    const r = await fetch(`/api/admin/social/accounts/?id=${a.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.revoked === true ? "Desconectado e revogado na rede." : j.revoked === "manual" ? "Desconectado. No Pinterest, o cliente remove o app em Configurações → Apps." : "Desconectado (as outras contas do mesmo login seguem ativas).") : j.error || "Não consegui desconectar.");
    await load();
  }
  async function createPersonal() {
    const r = await fetch("/api/admin/social/personal/", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setTarget(j.id); setMsg(`Cliente "${PERSONAL}" pronto. Conecte suas contas pessoais nele.`); }
    await load();
  }
  async function loadAudit() {
    const r = await fetch("/api/admin/social/audit/", { cache: "no-store" }).catch(() => null);
    setAudit(r?.ok ? (await r.json()).items : []);
  }

  const isConfigured = (providerId: string) => providers.find((p) => p.id === providerId)?.configured ?? false;
  const countByNet = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of items ?? []) m[a.network] = (m[a.network] ?? 0) + 1;
    return m;
  }, [items]);

  return (
    <div className="kb-glass grid gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="font-medium">Redes sociais (publicar pelo KBOS)</p>
        <p className="kb-muted text-sm">Cada cliente conecta as próprias contas pelo login oficial de cada rede. Instagram e Facebook são conectados separadamente para garantir a seleção exata de cada perfil.</p>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}

      <div className="kb-card gap-3">
        <label className="kb-field">
          <span className="kb-faint text-xs">Conectar para qual cliente?</span>
          <select className="kb-control" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Escolho depois (a conta entra sem cliente)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        </label>
        {!personal && <button type="button" className="kb-chip min-h-11 justify-self-start px-3 text-sm" onClick={() => void createPersonal()}>+ Criar meu cliente “{PERSONAL}”</button>}
        <div className="grid gap-2 sm:grid-cols-2">
          {CONNECTABLE_NETS.map((net) => {
            const on = isConfigured(net.provider);
            const total = countByNet[net.network] ?? 0;
            return (
              <a
                key={net.network}
                href={on ? connectHref(net.network, { project: target || null, back: "/admin/ajustes/", prompt: true }) : undefined}
                aria-disabled={!on}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border p-2.5 transition ${on ? "border-[var(--kb-line-strong)] bg-[var(--kb-chip)] hover:bg-[var(--kb-chip-hover)]" : "pointer-events-none border-[var(--kb-line)] opacity-55"}`}
              >
                <NetMark network={net.network} size={38} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{net.label}</b>
                  <small className="kb-faint block text-xs">
                    {on
                      ? total > 0
                        ? `${total} conectada${total === 1 ? "" : "s"} · Conectar outra`
                        : `Conectar ${net.label}`
                      : `Pendente de ativação · VPS opção ${OPTION[net.provider] ?? "?"}`}
                  </small>
                </span>
              </a>
            );
          })}
        </div>
        {target && <ConnectLinkButton key={target} projectId={target} projectName={targetName} />}
        {!target && <p className="kb-faint text-xs">Escolha um cliente para mandar a ele um link de conexão (vale 7 dias, sem senha do KBOS).</p>}
      </div>

      {items === null && <div className="kb-skel h-24" />}
      {items?.length === 0 && <p className="kb-muted text-sm">Nenhuma conta conectada ainda.</p>}
      {groups.map(([pid, g]) => (
        <div key={pid || "none"} className="flex flex-col">
          <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{g.title}</p>
          {g.items.map((a) => (
            <div key={a.id} className="kb-row flex-wrap gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="relative inline-flex shrink-0">
                  {a.pictureUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto de perfil vinda da rede */}
                      <img src={a.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                      <span className=" -bottom-1 -right-1 absolute rounded-md ring-2 ring-[#11101E]">
                        <NetMark network={a.network} size={18} />
                      </span>
                    </>
                  ) : (
                    <NetMark network={a.network} size={34} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{a.name}{a.username ? ` · @${a.username}` : ""}</span>
                  <span className={`block text-xs ${a.status === "ativo" ? "kb-faint" : "text-[var(--kb-soon)]"}`}>
                    {netInfo(a.network).label}{a.status !== "ativo" ? " · expirou, reconecte" : ""}{a.via === "link" ? " · pelo link" : a.via === "portal" ? " · pelo portal" : ""}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <select className="kb-control min-h-11 max-w-48" aria-label={`Cliente de ${a.name}`} value={a.projectId ?? ""} onChange={(e) => void assign(a, e.target.value)}>
                  <option value="">— não publicar —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
                </select>
                <button type="button" className="kb-chip min-h-11 px-3 text-sm" onClick={() => void remove(a)} aria-label={`Desconectar ${a.name}`}>Desconectar</button>
              </span>
            </div>
          ))}
        </div>
      ))}

      <details className="kb-card" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !audit) void loadAudit(); }}>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Registro de conexões (auditoria)</summary>
        {audit === null && <div className="kb-skel mt-2 h-16" />}
        {audit?.length === 0 && <p className="kb-muted text-sm">Nada registrado ainda.</p>}
        <ul className="mt-1 flex flex-col">
          {audit?.map((x) => (
            <li key={x.id} className="kb-row flex-col items-start gap-0.5 text-xs">
              <span className="text-sm">
                <b>{x.actor || WHO[x.actorKind] || x.actorKind}</b> {ACTION[x.action] ?? x.action}
                {x.provider ? ` · ${NETS.find((n) => n.provider === x.provider)?.label ?? x.provider}` : ""}{x.project ? ` · ${x.project}` : ""}
              </span>
              <span className="kb-faint">
                {new Date(x.createdAt).toLocaleString("pt-BR")} · {WHO[x.actorKind] ?? x.actorKind}{x.ip ? ` · IP ${x.ip}` : ""}
                {Array.isArray(x.detail?.contas) ? ` · ${(x.detail!.contas as string[]).join(", ")}` : ""}
              </span>
              {x.scopes && <span className="kb-faint break-all">Escopos: {x.scopes}</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
