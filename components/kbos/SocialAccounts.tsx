"use client";
import { useCallback, useEffect, useState } from "react";

type Account = { id: string; projectId: string | null; network: string; name: string; username: string | null; pictureUrl: string | null; status: string; lastError: string | null };
type Project = { id: string; titulo: string; parentId?: string | null; categoria?: string };
const NET: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };
const MSG: Record<string, string> = {
  ok: "Conectado. Agora diga de qual empresa é cada conta.",
  cancelado: "Login da Meta cancelado.",
  estado: "O login expirou ou veio de outra aba. Tente de novo.",
  config: "Falta configurar o app da Meta na VPS (META_APP_ID e META_APP_SECRET).",
};

/** Ajustes → Redes sociais: conecta Páginas do Facebook e Instagram profissional (Meta) e liga cada conta a uma operação. */
export default function SocialAccounts() {
  const [items, setItems] = useState<Account[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const [a, p] = await Promise.all([fetch("/api/admin/social/accounts/", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch("/api/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }))]);
    setItems(a?.items ?? []); setConfigured(a?.configured ?? false);
    setProjects((p.items ?? []).filter((x: Project) => x.categoria === "social" || x.parentId));
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const r = sp.get("redes");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mensagem da volta do login da Meta
    if (r) setMsg(r === "erro" ? `A Meta recusou: ${sp.get("msg") || "erro"}` : r === "ok" ? `${MSG.ok} (${sp.get("contas") ?? 0} contas)` : MSG[r] ?? "");
    void load();
  }, [load]);

  async function assign(a: Account, projectId: string) {
    const r = await fetch("/api/admin/social/accounts/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, projectId: projectId || null }) });
    setMsg(r.ok ? "Salvo." : "Não consegui salvar."); await load();
  }
  async function remove(a: Account) {
    if (!confirm(`Desconectar ${a.name} (${NET[a.network]})? Agendamentos dessa conta param.`)) return;
    await fetch(`/api/admin/social/accounts/?id=${a.id}`, { method: "DELETE" }); await load();
  }

  return (
    <div className="kb-glass grid gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Redes sociais (publicar pelo KBOS)</p>
          <p className="kb-muted text-sm">Instagram e Facebook pela Meta. O KBOS publica no horário do post; cada empresa com a própria conta.</p>
        </div>
        {/* o login da Meta é uma navegação completa (redirect do servidor), não uma rota do app */}
        <form action="/api/admin/social/meta/connect/" method="get"><button className="kb-btn min-h-11">{items?.length ? "Reconectar / adicionar" : "Conectar com a Meta"}</button></form>
      </div>
      {!configured && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{MSG.config} Veja o passo a passo em docs/PLANO-CONTEUDO.md.</p>}
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {items?.map((a) => (
        <div key={a.id} className="kb-row flex-wrap gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto de perfil vinda da Meta */}
            {a.pictureUrl ? <img src={a.pictureUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-full bg-white/10" />}
            <span className="min-w-0">
              <span className="block truncate text-sm">{a.name}{a.username ? ` · @${a.username}` : ""}</span>
              <span className={`block text-xs ${a.status === "ativo" ? "kb-faint" : "text-[#ff9f5a]"}`}>{NET[a.network] ?? a.network}{a.status !== "ativo" ? " · conexão expirada, reconecte" : ""}</span>
            </span>
          </span>
          <span className="flex shrink-0 gap-2">
            <select className="kb-control min-h-11" aria-label={`Empresa de ${a.name}`} value={a.projectId ?? ""} onChange={(e) => void assign(a, e.target.value)}>
              <option value="">— não publicar —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
            </select>
            <button type="button" className="kb-chip min-h-11" onClick={() => void remove(a)}>×</button>
          </span>
        </div>
      ))}
    </div>
  );
}
