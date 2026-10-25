"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FRONT_LABEL, frontOf } from "@/lib/kbos/fronts";
import { PIPELINE } from "@/lib/kbos/constants";
import ProjectPanel, { type PanelProject } from "./ProjectPanel";
import { isRecurring } from "@/lib/kbos/content-model";

type Project = PanelProject & { tasksTotal?: number; tasksDone?: number; monthPosts?: number; monthDone?: number };
type Contact = { id: string; name: string; company: string | null };

const CATS: [string, string][] = [["fotografia", "Fotografia"], ["video", "Vídeo"], ["sites", "Sites"], ["apps", "Apps"], ["lojas", "Lojas"], ["design", "Design"], ["social", "Redes sociais (recorrente)"]];
const brl = (v: string | null) => (v && Number(v) ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "");
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Belem" });

function due(p: Project): { text: string; cls: string } | null {
  // recorrente: o que atrasa é o conteúdo do mês, não o projeto
  if (isRecurring(p)) return { text: "Recorrente", cls: "" };
  if (!p.prazo || p.status === "entregue") return null;
  const ms = new Date(p.prazo).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return { text: `Atrasado · ${day(p.prazo)}`, cls: "late" };
  if (days <= 3) return { text: `Vence ${day(p.prazo)}`, cls: "soon" };
  return { text: day(p.prazo), cls: "" };
}

export default function KanbanBoard() {
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: "", categoria: "video", clienteEmail: "", contactId: "", valor: "", prazo: "" });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "late">("all");
  const [stage, setStage] = useState("producao");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setContacts(Array.isArray(j.items) ? j.items.filter((c: Contact & { status?: string }) => c.status !== "archived") : []))
      .catch(() => {});
    return () => clearTimeout(t);
  }, [load]);

  async function move(id: string, status: string) {
    setItems((s) => s && s.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error("Falha ao mover.");
    } catch {
      setNotice("Não consegui mover o projeto. Atualizei a lista.");
      load();
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, clienteEmail: form.clienteEmail || undefined, contactId: form.contactId || undefined, valor: form.valor || undefined, prazo: form.prazo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar.");
      setForm({ titulo: "", categoria: "video", clienteEmail: "", contactId: "", valor: "", prazo: "" });
      setShowForm(false);
      setNotice(data.warning || "Projeto criado.");
      setStage("novo");
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((p) => {
      if (only === "late" && due(p)?.cls !== "late") return false;
      if (!t) return true;
      return [p.titulo, p.categoria, p.contactName, p.contactCompany].some((v) => v?.toLowerCase().includes(t));
    });
  }, [items, q, only]);
  const lateCount = (items ?? []).filter((p) => due(p)?.cls === "late").length;
  const selected = items?.find((p) => p.id === selectedId) ?? null;

  if (error && !items) {
    return (
      <div className="kb-glass p-6">
        <p className="font-semibold">Não deu para carregar os projetos.</p>
        <p className="kb-muted mt-1 text-sm">{error.includes("DATABASE_URL") || error.includes("connect") ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push`." : error}</p>
        <button type="button" onClick={load} className="kb-chip mt-4 min-h-11">Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="kb-stagger flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto ou cliente" aria-label="Buscar projeto ou cliente" className="kb-control min-h-11 min-w-0 flex-1 basis-52" />
        <button type="button" className="kb-chip min-h-11" aria-pressed={only === "late"} onClick={() => setOnly(only === "late" ? "all" : "late")}>Atrasados{lateCount ? ` · ${lateCount}` : ""}</button>
        <button type="button" className="kb-btn min-h-11 shrink-0" aria-expanded={showForm} onClick={() => setShowForm((v) => !v)}>{showForm ? "Fechar" : "+ Novo projeto"}</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="kb-glass grid gap-3 p-4 md:grid-cols-6">
          <label className="kb-field md:col-span-3">Nome do projeto
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required placeholder="Ex.: Site da loja" className="kb-control min-h-11" />
          </label>
          <label className="kb-field md:col-span-3">Cliente
            <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className="kb-control min-h-11">
              <option value="">Sem cliente por enquanto</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.name} · ${c.company}` : c.name}</option>)}
            </select>
          </label>
          <label className="kb-field md:col-span-2">Tipo
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="kb-control min-h-11">
              {CATS.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
            </select>
          </label>
          <label className="kb-field md:col-span-2">Valor (R$)
            <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} inputMode="decimal" placeholder="Opcional" className="kb-control min-h-11" />
          </label>
          <label className="kb-field md:col-span-2">Prazo
            <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="kb-control min-h-11" />
          </label>
          <label className="kb-field md:col-span-4">E-mail do portal do cliente (para ele ver o projeto)
            <input value={form.clienteEmail} onChange={(e) => setForm({ ...form, clienteEmail: e.target.value })} type="email" placeholder="Opcional" className="kb-control min-h-11" />
          </label>
          <button type="submit" disabled={busy} className="kb-btn min-h-11 md:col-span-2 md:self-end">{busy ? "Criando…" : "Criar projeto"}</button>
        </form>
      )}
      {notice && <p role="status" className="kb-tag self-start">{notice}</p>}

      <div className="kb-seg md:hidden" role="tablist" aria-label="Etapa do projeto" style={{ gridAutoColumns: "max-content", overflowX: "auto" }}>
        {PIPELINE.map((c) => (
          <button key={c.id} role="tab" aria-selected={stage === c.id} onClick={() => setStage(c.id)} className="kb-chip min-h-11 whitespace-nowrap" aria-pressed={stage === c.id}>
            {c.label} · {shown.filter((p) => p.status === c.id).length}
          </button>
        ))}
      </div>

      {!items ? (
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="kb-skel h-28" />)}</div>
      ) : (
        <div className="grid gap-3 md:flex md:overflow-x-auto md:pb-4">
          {PIPELINE.map((col) => {
            const list = shown.filter((p) => p.status === col.id);
            return (
              <section
                key={col.id}
                aria-label={col.label}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData("text/project-id"); if (id) move(id, col.id); }}
                className={`${col.id === stage ? "block" : "hidden"} kb-glass min-w-0 p-3 md:block md:w-[272px] md:shrink-0`}
              >
                <p className="kb-faint hidden px-1 text-[11px] uppercase tracking-[0.22em] md:block">{col.label} · {list.length}</p>
                <div className="flex flex-col gap-2 md:mt-3">
                  {list.map((p) => {
                    const dd = due(p);
                    const total = p.tasksTotal ?? 0;
                    const pct = total ? Math.round(((p.tasksDone ?? 0) / total) * 100) : 0;
                    const who = p.contactCompany || p.contactName;
                    const parent = p.parentId ? items?.find((x) => x.id === p.parentId)?.titulo : null;
                    const mp = p.monthPosts ?? 0;
                    return (
                      <button key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/project-id", p.id)} onClick={() => setSelectedId(p.id)} className={`kb-card cursor-grab text-left active:cursor-grabbing ${dd?.cls === "late" ? "late" : ""}`}>
                        {parent && <span className="kb-faint text-[11px] uppercase tracking-[0.14em]">{parent} ›</span>}
                        <span className="text-sm font-medium leading-snug">{p.titulo}</span>
                        {who && !parent && <span className="kb-muted text-xs">{who}</span>}
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="kb-tag">{frontOf(p.categoria) ? FRONT_LABEL[frontOf(p.categoria)!] : p.categoria}</span>
                          {dd && <span className={`kb-tag ${dd.cls}`}>{dd.text}</span>}
                          {brl(p.valor) && <span className="kb-tag">{brl(p.valor)}</span>}
                        </span>
                        {isRecurring(p) && mp > 0 && (
                          <span className="flex items-center gap-2" aria-label={`Mês: ${p.monthDone} de ${mp} conteúdos publicados`}>
                            <span className="kb-faint w-9 text-[11px]">mês</span>
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#3ecf8e]" style={{ width: `${Math.round(((p.monthDone ?? 0) / mp) * 100)}%` }} /></span>
                            <span className="kb-faint text-[11px]">{p.monthDone}/{mp}</span>
                          </span>
                        )}
                        {total > 0 && (
                          <span className="flex items-center gap-2" aria-label={`${p.tasksDone} de ${total} tarefas feitas`}>
                            {isRecurring(p) && mp > 0 && <span className="kb-faint w-9 text-[11px]">tarefas</span>}
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]" style={{ width: `${pct}%` }} /></span>
                            <span className="kb-faint text-[11px]">{p.tasksDone}/{total}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {list.length === 0 && <p className="kb-faint px-1 py-3 text-sm">{q || only === "late" ? "Nada com esse filtro." : "Nenhum projeto nesta etapa."}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {items && items.length === 0 && <p className="kb-muted text-sm">Nenhum projeto ainda. Crie um acima, ou aceite um orçamento que o projeto nasce sozinho.</p>}
      {selected && <ProjectPanel project={selected} contacts={contacts} projects={items ?? []} onClose={() => setSelectedId(null)} onChanged={load} onMoved={move} />}
    </div>
  );
}
