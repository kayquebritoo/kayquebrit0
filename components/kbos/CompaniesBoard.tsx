"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Access = { userId: string; name: string; email: string; role: Role; revokedAt: string | null; disabledAt: string | null };
type Company = {
  id: string; name: string; slug: string; parentId: string | null; lumePasta: string | null;
  access: Access[]; projects: { id: string; titulo: string }[];
};
type Project = { id: string; titulo: string; contactName?: string | null };
type Role = "titular" | "gestao" | "acompanhar";

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "titular", label: "Titular", hint: "vê tudo, inclusive pagamentos" },
  { id: "gestao", label: "Gestão", hint: "planeja e edita o conteúdo" },
  { id: "acompanhar", label: "Acompanhar", hint: "vê e aprova" },
];

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
  return j;
}

/** Empresas do cliente: grupo, pasta do Lume, projetos ligados e quem acessa cada uma no portal. */
export default function CompaniesBoard() {
  const [items, setItems] = useState<Company[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", parentId: "", lumePasta: "" });

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        fetch("/api/admin/companies/", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/projects/", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!c.items) throw new Error(c.error || "Não deu para carregar as empresas.");
      setItems(c.items);
      setProjects(p.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); setNotice(ok); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro."); }
    finally { setBusy(""); }
  }

  const groups = useMemo(() => (items ?? []).filter((c) => !c.parentId), [items]);
  const kids = (id: string) => (items ?? []).filter((c) => c.parentId === id);
  const linked = useMemo(() => new Set((items ?? []).flatMap((c) => c.projects.map((p) => p.id))), [items]);

  if (!items && !error) return <div className="grid gap-4">{[0, 1].map((i) => <div key={i} className="kb-skel h-40" />)}</div>;

  return (
    <div className="kb-stagger flex flex-col gap-5">
      <section className="kb-glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl">Empresas dos clientes</h2>
            <p className="kb-muted mt-1 max-w-2xl text-sm">Cada empresa reúne os projetos, a pasta do Lume e quem do cliente pode entrar no portal. Quem acessa o grupo vê todas as empresas dele.</p>
          </div>
          <button type="button" className="kb-btn min-h-11" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>{creating ? "Fechar" : "+ Nova empresa"}</button>
        </div>
        {creating && (
          <form className="mt-4 grid gap-3 sm:grid-cols-[2fr_2fr_1.5fr_auto] sm:items-end" onSubmit={(e) => {
            e.preventDefault();
            void act("new", () => send("/api/admin/companies/", "POST", { name: form.name, parentId: form.parentId || null, lumePasta: form.lumePasta || null }), "Empresa criada.")
              .then(() => { setForm({ name: "", parentId: "", lumePasta: "" }); setCreating(false); });
          }}>
            <label className="kb-field"><span>Nome</span><input className="kb-control min-h-12 text-base" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Hotel Atalaia VIP" /></label>
            <label className="kb-field"><span>Dentro do grupo</span><select className="kb-control min-h-12" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">— é o grupo / empresa única —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            <label className="kb-field"><span>Pasta no Lume</span><input className="kb-control min-h-12 text-base" maxLength={80} value={form.lumePasta} onChange={(e) => setForm({ ...form, lumePasta: e.target.value })} placeholder="opcional" /></label>
            <button type="submit" className="kb-btn min-h-12" disabled={busy === "new"}>{busy === "new" ? "Criando…" : "Criar"}</button>
          </form>
        )}
      </section>

      {error && <p role="alert" className="kb-glass p-4 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="kb-muted text-sm">{notice}</p>}

      {items && items.length === 0 && (
        <div className="kb-glass p-8 text-center">
          <p className="text-lg font-semibold">Nenhuma empresa cadastrada</p>
          <p className="kb-muted mt-2 text-sm">Comece pelo grupo (ex.: Grupo VIP) e depois as empresas dele. Clientes com uma empresa só não precisam de grupo.</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-3">
          <CompanyCard company={g} projects={projects} linked={linked} busy={busy} act={act} />
          {kids(g.id).map((k) => (
            <div key={k.id} className="border-l border-white/10 pl-3 sm:pl-6">
              <CompanyCard company={k} projects={projects} linked={linked} busy={busy} act={act} groupName={g.name} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CompanyCard({ company: c, projects, linked, busy, act, groupName }: {
  company: Company; projects: Project[]; linked: Set<string>; busy: string; groupName?: string;
  act: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [pasta, setPasta] = useState(c.lumePasta ?? "");
  const [link, setLink] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("acompanhar");
  const [confirm, setConfirm] = useState("");
  const active = c.access.filter((a) => !a.revokedAt);
  const revoked = c.access.filter((a) => a.revokedAt);
  const free = projects.filter((p) => !linked.has(p.id));
  const base = `/api/admin/companies/${c.id}`;

  return (
    <article className="kb-glass flex flex-col gap-4 p-5" aria-label={c.name}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          {groupName && <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">{groupName}</p>}
          <h3 className="font-display break-words text-lg">{c.name}</h3>
        </div>
        <span className="kb-tag">{active.length} acesso{active.length === 1 ? "" : "s"}</span>
      </header>

      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void act(`pasta:${c.id}`, () => send(base + "/", "PATCH", { lumePasta: pasta || null }), "Pasta do Lume salva."); }}>
        <label className="kb-field min-w-0 flex-1"><span>Pasta no Lume {groupName && !pasta ? "(usa a do grupo)" : ""}</span><input className="kb-control min-h-11 text-base" maxLength={80} value={pasta} onChange={(e) => setPasta(e.target.value)} placeholder="sem pasta" /></label>
        <button type="submit" className="kb-btn-ghost min-h-11" disabled={busy === `pasta:${c.id}` || pasta === (c.lumePasta ?? "")}>Salvar</button>
      </form>

      <section aria-label="Projetos da empresa">
        <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Projetos</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.projects.map((p) => (
            <span key={p.id} className="kb-chip min-h-9 gap-2">{p.titulo}
              <button type="button" aria-label={`Desligar ${p.titulo}`} className="kb-faint hover:text-white" disabled={!!busy} onClick={() => void act(`unlink:${p.id}`, () => send(`${base}/projects/?projectId=${p.id}`, "DELETE"), "Projeto desligado.")}>×</button>
            </span>
          ))}
          {c.projects.length === 0 && <span className="kb-faint text-sm">Nenhum projeto ligado.</span>}
        </div>
        {free.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select aria-label="Projeto para ligar" className="kb-control min-h-11 min-w-0 flex-1" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">Ligar um projeto…</option>
              {free.map((p) => <option key={p.id} value={p.id}>{p.titulo}{p.contactName ? ` · ${p.contactName}` : ""}</option>)}
            </select>
            <button type="button" className="kb-btn-ghost min-h-11" disabled={!link || !!busy} onClick={() => void act(`link:${c.id}`, () => send(`${base}/projects/`, "POST", { projectId: link }), "Projeto ligado.").then(() => setLink(""))}>Ligar</button>
          </div>
        )}
      </section>

      <section aria-label="Quem acessa no portal">
        <p className="kb-faint text-[11px] uppercase tracking-[0.2em]">Quem acessa no portal</p>
        <div className="mt-2 flex flex-col">
          {active.map((a) => (
            <div key={a.userId} className="kb-row flex-wrap gap-2">
              <span className="min-w-0">
                <span className="block truncate text-sm">{a.name}{a.disabledAt && <span className="kb-tag late ml-2">conta desativada</span>}</span>
                <span className="kb-faint block truncate text-xs">{a.email}</span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                <select aria-label={`Papel de ${a.name}`} className="kb-control min-h-10" value={a.role} disabled={!!busy}
                  onChange={(e) => void act(`role:${a.userId}`, () => send(`${base}/access/`, "POST", { email: a.email, role: e.target.value }), "Papel atualizado.")}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {confirm === `rev:${a.userId}` ? (
                  <button type="button" className="kb-btn min-h-10" disabled={!!busy} onClick={() => void act(`rev:${a.userId}`, () => send(`${base}/access/?userId=${a.userId}`, "DELETE"), `Acesso de ${a.name} revogado.`).then(() => setConfirm(""))}>Confirmar revogação</button>
                ) : (
                  <button type="button" className="kb-btn-ghost min-h-10" onClick={() => setConfirm(`rev:${a.userId}`)}>Revogar</button>
                )}
                {confirm === `off:${a.userId}` ? (
                  <button type="button" className="kb-btn min-h-10" disabled={!!busy} onClick={() => void act(`off:${a.userId}`, () => send(`/api/admin/users/${a.userId}/`, "PATCH", { disabled: !a.disabledAt }), a.disabledAt ? "Conta reativada." : "Conta desativada: as sessões caíram.").then(() => setConfirm(""))}>{a.disabledAt ? "Confirmar reativação" : "Confirmar: desativar a conta inteira"}</button>
                ) : (
                  <button type="button" className="kb-btn-ghost min-h-10" onClick={() => setConfirm(`off:${a.userId}`)}>{a.disabledAt ? "Reativar conta" : "Desativar conta"}</button>
                )}
              </span>
            </div>
          ))}
          {active.length === 0 && <p className="kb-faint py-2 text-sm">Ninguém do cliente acessa esta empresa ainda.</p>}
        </div>
        <form className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_auto]" onSubmit={(e) => {
          e.preventDefault();
          void act(`grant:${c.id}`, () => send(`${base}/access/`, "POST", { email, role }), "Acesso liberado.").then(() => setEmail(""));
        }}>
          <label className="kb-field"><span>E-mail da conta do cliente</span><input type="email" required className="kb-control min-h-11 text-base" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="a conta precisa existir (CRM → Acesso ao portal)" /></label>
          <label className="kb-field"><span>Papel</span><select className="kb-control min-h-11" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label} — {r.hint}</option>)}</select></label>
          <button type="submit" className="kb-btn min-h-11 self-end" disabled={busy === `grant:${c.id}`}>Dar acesso</button>
        </form>
        {revoked.length > 0 && <p className="kb-faint mt-2 text-xs">Revogados: {revoked.map((a) => a.name).join(", ")}</p>}
      </section>
    </article>
  );
}
