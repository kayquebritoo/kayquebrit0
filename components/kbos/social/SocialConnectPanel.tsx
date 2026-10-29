"use client";

import { useCallback, useEffect, useState } from "react";
import { CONNECTABLE_NETS, NetMark, connectHref, netInfo, returnMessage, type ProviderInfo, type SocialAccount } from "./networks";

type Project = { id: string; titulo: string; parentId: string | null };
type Item = SocialAccount & {
  expiresAt?: string | null;
  refreshExpiresAt?: string | null;
  hasRefresh?: boolean | null;
};

const SCOPE_LABELS: Record<string, string> = {
  instagram_basic: "Perfil do Instagram",
  instagram_content_publish: "Publicar no Instagram",
  pages_show_list: "Listar Páginas",
  pages_read_engagement: "Engajamento da Página",
  pages_manage_posts: "Publicar no Facebook",
  business_management: "Portfólio Empresarial",
  "https://www.googleapis.com/auth/youtube.upload": "Enviar vídeos no YouTube",
  "https://www.googleapis.com/auth/youtube.readonly": "Ler canal do YouTube",
  "https://www.googleapis.com/auth/business.manage": "Gerenciar Perfil da Empresa no Google",
  "user.info.basic": "Perfil básico do TikTok",
  "video.publish": "Publicar vídeos no TikTok",
  "video.upload": "Enviar vídeos no TikTok",
  "user_accounts:read": "Ler conta do Pinterest",
  "boards:read": "Ler pastas do Pinterest",
  "pins:read": "Ler Pins",
  "pins:write": "Criar e publicar Pins",
  openid: "Identificação OpenID",
  profile: "Perfil do LinkedIn",
  w_member_social: "Publicar no LinkedIn",
};

function summarizeScopes(scopes: string | null | undefined, provider?: string | null): string {
  if (!scopes?.trim()) {
    if (provider === "meta") return "Perfil do Instagram · Publicar no Instagram · Publicar no Facebook";
    return "Publicação e leitura básica do perfil autorizado";
  }
  const parts = scopes
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const translated = parts.map((s) => SCOPE_LABELS[s] ?? s);
  return [...new Set(translated)].join(" · ");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function expirationSummary(a: Item): { text: string; warn: boolean } {
  if (a.status !== "ativo") {
    return {
      text: a.lastError
        ? `Autorização expirada/revogada (${a.lastError}) — reconecte para voltar a publicar`
        : "Autorização expirada — reconecte para voltar a publicar",
      warn: true,
    };
  }
  if (a.provider === "meta") {
    return { text: "Token de Página de longa duração · renovação gerenciada", warn: false };
  }
  if (a.hasRefresh) {
    const until = fmtDate(a.refreshExpiresAt) ?? fmtDate(a.expiresAt);
    return {
      text: until ? `Renovação automática ativa · ciclo até ${until}` : "Renovação automática ativa",
      warn: false,
    };
  }
  const exp = fmtDate(a.expiresAt);
  return {
    text: exp ? `Válido até ${exp}` : "Autorização ativa",
    warn: false,
  };
}

export default function SocialConnectPanel({ token, linkToken, initialProject }: { token?: string; linkToken?: string; initialProject?: string }) {
  const tk = token ?? linkToken;
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(initialProject ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiredLink, setExpiredLink] = useState(false);
  const [msg, setMsg] = useState<string>(() =>
    typeof window !== "undefined" ? returnMessage(new URLSearchParams(window.location.search)) : "",
  );

  const endpoint = tk ? `/api/public/social-connect/${encodeURIComponent(tk)}/` : "/api/portal/social";

  const load = useCallback(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (r.status === 404 && tk) {
      setExpiredLink(true);
      setLoading(false);
      return;
    }
    if (r.ok) {
      const j = await r.json();
      setProviders(j.providers ?? []);
      setProjects(j.projects ?? []);
      setItems(j.items ?? []);
      setProjectId((prev) => prev || j.projects?.[0]?.id || "");
    }
    setLoading(false);
  }, [endpoint, tk]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (expiredLink) {
    return (
      <section className="kb-glass p-5">
        <p className="font-display text-lg">Este link venceu ou foi cancelado.</p>
        <p className="kb-muted mt-1 text-sm">Peça um link novo ao Kayque no WhatsApp ou entre no seu portal.</p>
      </section>
    );
  }
  if (!loading && !tk && projects.length === 0) return null;

  const isOn = (provider: string) => providers.find((p) => p.id === provider)?.configured ?? false;

  async function disconnect(a: Item) {
    if (!confirm(`Desconectar ${a.name}? O KBOS para de publicar nesta conta e apaga a autorização.`)) return;
    const r = await fetch(`${endpoint}?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(
      j.revoked === "manual"
        ? "Conta desconectada do KBOS. No Pinterest, se quiser remover do painel deles também, acesse pinterest.com → Configurações → Segurança e logins."
        : "Conta desconectada e autorização revogada.",
    );
    await load();
  }

  async function moveProject(id: string, nextProjectId: string) {
    await fetch("/api/portal/social", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, projectId: nextProjectId }),
    });
    await load();
  }

  return (
    <section className="kb-glass flex flex-col gap-4 p-5" aria-label="Suas redes sociais">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kb-faint text-[11px] uppercase tracking-[0.22em]">Suas redes · Conexão oficial OAuth</p>
          <h2 className="font-display mt-1 text-xl">Redes sociais conectadas</h2>
          <p className="kb-muted mt-1 text-sm">
            Conecte suas contas no login oficial de cada plataforma para que a equipe agende e publique os conteúdos aprovados. O KBOS nunca vê nem armazena sua senha.
          </p>
        </div>
        {!tk && projects.length > 1 && (
          <label className="kb-field text-xs">
            Conectar na empresa
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="kb-control min-h-11 sm:w-56">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {msg && (
        <p role="status" className="kb-tag self-start">
          {msg}
        </p>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTABLE_NETS.map((n) => {
          const on = isOn(n.provider);
          const connected = items.filter(
            (i) => i.network === n.network && (!projectId || !i.projectId || i.projectId === projectId),
          );
          const hasExpired = connected.some((c) => c.status !== "ativo");
          const href = connectHref(n.network, { link: tk, project: tk ? undefined : projectId, prompt: true });
          return (
            <div
              key={n.network}
              className={`kb-card flex flex-col justify-between gap-3 !p-4 ${on ? "" : "opacity-75"}`}
            >
              <div className="flex items-start gap-3">
                <NetMark network={n.network} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="truncate font-medium">{n.label}</span>
                    {!on ? (
                      <span
                        className="kb-chip min-h-6 !px-2 !py-0.5 text-[10px]"
                        style={{ color: "#f5c46e", borderColor: "rgba(245,196,110,0.35)" }}
                      >
                        Pendente de ativação
                      </span>
                    ) : hasExpired ? (
                      <span className="kb-chip min-h-6 !px-2 !py-0.5 text-[10px] text-[#f5c46e]">
                        Reconexão necessária
                      </span>
                    ) : connected.length > 0 ? (
                      <span className="kb-chip min-h-6 !px-2 !py-0.5 text-[10px] text-[#22c55e]">
                        {connected.length} conectada{connected.length > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                  <p className="kb-muted mt-0.5 text-xs">
                    {!on
                      ? "Aguardando ativação de credenciais/revisão OAuth da plataforma."
                      : connected.length > 0
                        ? connected.map((c) => (c.username ? `@${c.username}` : c.name)).join(", ")
                        : "Login oficial da plataforma (OAuth 2.0)"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                {on ? (
                  <a
                    href={href}
                    className={
                      connected.length > 0 && !hasExpired
                        ? "kb-btn-ghost min-h-10 w-full text-center text-xs"
                        : "kb-btn min-h-10 w-full text-center text-xs"
                    }
                  >
                    {hasExpired
                      ? "Reconectar conta →"
                      : connected.length > 0
                        ? "Conectar outra / Atualizar →"
                        : "Conectar →"}
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="kb-chip min-h-10 w-full justify-center text-xs opacity-70"
                  >
                    Pendente de ativação externa
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Contas vinculadas e permissões</p>
            <span className="kb-faint text-xs">
              {items.filter((i) => i.status === "ativo").length} ativa(s) de {items.length}
            </span>
          </div>
          {items.map((a) => {
            const info = netInfo(a.network);
            const exp = expirationSummary(a);
            const scopeText = summarizeScopes(a.scopes, a.provider);
            const provId = a.provider || info.provider;
            const provConfigured = isOn(provId);
            return (
              <div key={a.id} className="kb-card flex flex-col gap-2.5 !p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="relative inline-flex shrink-0">
                      {a.pictureUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                          <span className="-bottom-1 -right-1 absolute rounded-md ring-2 ring-[#11101E]">
                            <NetMark network={a.network} size={18} />
                          </span>
                        </>
                      ) : (
                        <NetMark network={a.network} size={32} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{a.name}</span>
                        {a.username && <span className="kb-muted font-normal">@{a.username}</span>}
                      </p>
                      <p className="kb-faint flex flex-wrap items-center gap-1.5 text-xs">
                        <span>{info.label}</span>
                        {a.project && (
                          <>
                            <span>·</span>
                            <span>
                              Empresa: <strong className="text-[var(--kb-ink)] font-normal">{a.project}</strong>
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span
                          className="inline-flex items-center gap-1 font-medium"
                          style={{ color: a.status === "ativo" ? "#22c55e" : "#f5c46e" }}
                        >
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: a.status === "ativo" ? "#22c55e" : "#f5c46e" }}
                          />
                          {a.status === "ativo" ? "Autorizado" : "Requer reconexão"}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!tk && projects.length > 1 && (
                      <select
                        aria-label={`Empresa de ${a.name}`}
                        value={a.projectId ?? ""}
                        onChange={(e) => e.target.value && moveProject(a.id, e.target.value)}
                        className="kb-control min-h-9 text-xs"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.titulo}
                          </option>
                        ))}
                      </select>
                    )}
                    {provConfigured && (
                      <a
                        href={connectHref(a.network, { link: tk, project: tk ? undefined : (a.projectId ?? projectId), prompt: true })}
                        className={a.status === "ativo" ? "kb-chip min-h-9 text-xs" : "kb-btn min-h-9 !px-3 !text-xs"}
                      >
                        Reconectar
                      </a>
                    )}
                    <button type="button" onClick={() => disconnect(a)} className="kb-btn-ghost min-h-9 text-xs">
                      Desconectar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px]">
                  <span className="kb-muted">
                    <strong className="kb-faint font-normal uppercase tracking-[0.12em]">Permissões:</strong> {scopeText}
                  </span>
                  <span className={exp.warn ? "text-[#f5c46e]" : "kb-faint"}>{exp.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
