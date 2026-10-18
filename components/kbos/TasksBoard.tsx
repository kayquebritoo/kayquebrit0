"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Task = {
  id: string;
  titulo: string;
  status: "todo" | "doing" | "done";
  dueAt: string | null;
  description: string | null;
  assignee: string | null;
  priority: "normal" | "alta";
  projectId: string | null;
  contactId: string | null;
  doneAt: string | null;
  projectTitle: string | null;
  contactName: string | null;
};
type Option = { id: string; label: string };

type Form = {
  id: string | null;
  titulo: string;
  description: string;
  due: string; // yyyy-mm-dd ou ""
  assignee: string;
  priority: "normal" | "alta";
  projectId: string;
  contactId: string;
  status: Task["status"];
};

/* ── datas: tudo em chave yyyy-mm-dd, no fuso de quem usa ── */
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return key(d);
};
const nextWeekday = (wd: number) => {
  const d = new Date();
  const diff = (wd - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return key(d);
};
/** Prazo salvo ao meio-dia UTC: a data não "anda" no fuso de Belém. */
const dueKeyOf = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const toDueISO = (k: string) => `${k}T12:00:00.000Z`;
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function dueLabel(k: string, today: string): string {
  if (k === today) return "Hoje";
  if (k === addDays(1)) return "Amanhã";
  if (k === addDays(-1)) return "Ontem";
  const d = new Date(`${k}T12:00:00`);
  const days = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  if (days > 1 && days < 7) return WEEK[d.getDay()].replace(/^./, (c) => c.toUpperCase());
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

const QUICK = [
  { label: "Hoje", get: () => addDays(0) },
  { label: "Amanhã", get: () => addDays(1) },
  { label: "Sexta", get: () => nextWeekday(5) },
  { label: "Próx. segunda", get: () => nextWeekday(1) },
];

export default function TasksBoard() {
  const [items, setItems] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [quick, setQuick] = useState("");
  const [quickDue, setQuickDue] = useState<string>(addDays(0));
  const [who, setWho] = useState<string>("all");
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const quickRef = useRef<HTMLInputElement>(null);
  const today = addDays(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    load();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects((d.items || d.projects || []).map((p: { id: string; titulo: string }) => ({ id: p.id, label: p.titulo }))))
      .catch(() => {});
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) =>
        setContacts(
          (d.items || [])
            .filter((c: { status: string }) => c.status !== "archived")
            .map((c: { id: string; name: string; company: string | null }) => ({ id: c.id, label: c.company ? `${c.name} · ${c.company}` : c.name }))
            .sort((a: Option, b: Option) => a.label.localeCompare(b.label, "pt-BR"))
        )
      )
      .catch(() => {});
    // Atalho do Hoje: ?nova=1 já foca a criação.
    if (new URLSearchParams(window.location.search).get("nova") === "1") {
      window.history.replaceState(null, "", window.location.pathname);
      setTimeout(() => quickRef.current?.focus(), 50);
    }
  }, [load]);

  const people = useMemo(() => [...new Set(items.map((t) => t.assignee).filter((a): a is string => !!a))].sort(), [items]);

  const groups = useMemo(() => {
    const open = items.filter((t) => t.status !== "done" && (who === "all" || t.assignee === who));
    const in7 = addDays(7);
    const g = { late: [] as Task[], today: [] as Task[], week: [] as Task[], later: [] as Task[], none: [] as Task[] };
    for (const t of open) {
      const k = dueKeyOf(t.dueAt);
      if (!k) g.none.push(t);
      else if (k < today) g.late.push(t);
      else if (k === today) g.today.push(t);
      else if (k <= in7) g.week.push(t);
      else g.later.push(t);
    }
    const done = items.filter((t) => t.status === "done" && (who === "all" || t.assignee === who));
    return { ...g, done };
  }, [items, who, today]);

  async function addQuick(e: React.FormEvent) {
    e.preventDefault();
    const titulo = quick.trim();
    if (!titulo) return;
    setQuick("");
    const temp: Task = {
      id: `tmp-${Date.now()}`,
      titulo,
      status: "todo",
      dueAt: quickDue ? toDueISO(quickDue) : null,
      description: null,
      assignee: null,
      priority: "normal",
      projectId: null,
      contactId: null,
      doneAt: null,
      projectTitle: null,
      contactName: null,
    };
    setItems((s) => [temp, ...s]);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo, dueAt: quickDue ? toDueISO(quickDue) : null }),
    });
    if (!res.ok) setError("Não consegui criar a tarefa.");
    load();
  }

  async function toggle(t: Task) {
    const next = t.status === "done" ? "todo" : "done";
    setItems((s) => s.map((x) => (x.id === t.id ? { ...x, status: next, doneAt: next === "done" ? new Date().toISOString() : null } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  function openEdit(t: Task) {
    setFormError("");
    setForm({
      id: t.id,
      titulo: t.titulo,
      description: t.description ?? "",
      due: dueKeyOf(t.dueAt) ?? "",
      assignee: t.assignee ?? "",
      priority: t.priority === "alta" ? "alta" : "normal",
      projectId: t.projectId ?? "",
      contactId: t.contactId ?? "",
      status: t.status,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        titulo: form.titulo.trim(),
        description: form.description.trim() || null,
        dueAt: form.due ? toDueISO(form.due) : null,
        assignee: form.assignee.trim() || null,
        priority: form.priority,
        projectId: form.projectId || null,
        contactId: form.contactId || null,
        status: form.status,
      };
      const res = await fetch(form.id ? `/api/tasks/${form.id}` : "/api/tasks", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Não consegui salvar.");
      setForm(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id || !confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${form.id}`, { method: "DELETE" });
    setForm(null);
    load();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const row = (t: Task) => {
    const k = dueKeyOf(t.dueAt);
    const late = t.status !== "done" && !!k && k < today;
    const meta = [t.projectTitle, t.contactName, t.assignee].filter(Boolean).join(" · ");
    return (
      <div key={t.id} className="kb-row items-start">
        <button
          type="button"
          onClick={() => toggle(t)}
          aria-label={t.status === "done" ? `Reabrir: ${t.titulo}` : `Concluir: ${t.titulo}`}
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span
            aria-hidden
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[13px] transition ${
              t.status === "done"
                ? "border-[var(--kb-good)] bg-[var(--kb-good)] text-[#11101e]"
                : late
                  ? "border-[var(--kb-late-dot)]"
                  : "border-[var(--kb-line-strong)]"
            }`}
          >
            {t.status === "done" ? "✓" : ""}
          </span>
        </button>
        <button type="button" onClick={() => openEdit(t)} className="min-w-0 flex-1 text-left">
          <span className={`block text-[15px] ${t.status === "done" ? "kb-faint line-through" : "kb-ink"}`}>
            {t.priority === "alta" && t.status !== "done" ? <span className="text-[var(--kb-late)]">! </span> : null}
            {t.titulo}
          </span>
          {meta && <span className="kb-faint block truncate text-[12px]">{meta}</span>}
        </button>
        {k && (
          <span className={`kb-tag shrink-0 ${late ? "late" : k === today && t.status !== "done" ? "soon" : ""}`}>
            {late ? `${dueLabel(k, today)} · atrasada` : dueLabel(k, today)}
          </span>
        )}
      </div>
    );
  };

  const section = (title: string, list: Task[], tone?: "late") =>
    list.length > 0 && (
      <section className="kb-glass px-4 pb-1 pt-3">
        <h2 className={`flex items-center gap-2 text-[13px] font-semibold ${tone === "late" ? "text-[var(--kb-late)]" : "kb-muted"}`}>
          {tone === "late" && <span className="kb-dot-late kb-pulse" aria-hidden />}
          {title} <span className="kb-faint font-normal tabular-nums">{list.length}</span>
        </h2>
        {list.map(row)}
      </section>
    );

  const openCount = groups.late.length + groups.today.length + groups.week.length + groups.later.length + groups.none.length;

  return (
    <div className="space-y-4">
      {error && <div className="kb-tag late w-full justify-start rounded-2xl! px-4! py-3! text-sm">{error}</div>}

      {/* Criar rápido: escreve, escolhe o dia, Enter. */}
      <form onSubmit={addQuick} className="kb-glass space-y-3 p-3">
        <div className="flex items-center gap-2 pl-2">
          <label htmlFor="kb-task-quick" className="sr-only">Nova tarefa</label>
          <input
            id="kb-task-quick"
            ref={quickRef}
            className="kb-input"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="O que precisa ser feito?"
            enterKeyHint="done"
            autoComplete="off"
          />
          <button type="submit" className="kb-btn h-11! min-h-0! px-4!" disabled={!quick.trim()} aria-label="Adicionar tarefa">
            +
          </button>
        </div>
        <div className="kb-scroll-x gap-2!">
          {QUICK.map((q) => {
            const v = q.get();
            return (
              <button key={q.label} type="button" className="kb-chip min-h-9!" aria-pressed={quickDue === v} onClick={() => setQuickDue(v)}>
                {q.label}
              </button>
            );
          })}
          <button type="button" className="kb-chip min-h-9!" aria-pressed={quickDue === ""} onClick={() => setQuickDue("")}>
            Sem prazo
          </button>
          <label className="kb-chip min-h-9! relative">
            📅 {quickDue && !QUICK.some((q) => q.get() === quickDue) ? dueLabel(quickDue, today) : "Data"}
            <input type="date" className="absolute inset-0 opacity-0" value={quickDue} onChange={(e) => setQuickDue(e.target.value)} aria-label="Escolher data" />
          </label>
        </div>
      </form>

      {people.length > 0 && (
        <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
          <button type="button" className="kb-chip" aria-pressed={who === "all"} onClick={() => setWho("all")}>Todos</button>
          {people.map((p) => (
            <button key={p} type="button" className="kb-chip" aria-pressed={who === p} onClick={() => setWho(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      {section("Atrasadas", groups.late, "late")}
      {section("Hoje", groups.today)}
      {section("Próximos 7 dias", groups.week)}
      {section("Depois", groups.later)}
      {section("Sem prazo", groups.none)}
      {openCount === 0 && (
        <p className="kb-glass kb-muted p-8 text-center text-sm">Nada pendente. Escreva acima a próxima coisa a fazer.</p>
      )}

      {groups.done.length > 0 && (
        <div>
          <button type="button" className="kb-muted px-1 text-sm underline underline-offset-4" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Esconder" : "Ver"} feitas nos últimos 14 dias ({groups.done.length})
          </button>
          {showDone && <div className="mt-3">{section("Feitas", groups.done)}</div>}
        </div>
      )}

      {form && (
        <div className="kb-modal-back" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" aria-label="Editar tarefa">
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">{form.id ? "Tarefa" : "Nova tarefa"}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>
            <label className="kb-field">
              <span>O que fazer</span>
              <input className="kb-control" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} required />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field">
                <span>Prazo</span>
                <input className="kb-control" type="date" value={form.due} onChange={(e) => set("due", e.target.value)} />
              </label>
              <label className="kb-field">
                <span>Quem faz</span>
                <input className="kb-control" list="kb-people" value={form.assignee} onChange={(e) => set("assignee", e.target.value)} placeholder="Eu" />
                <datalist id="kb-people">
                  {people.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
            </div>
            <div className="kb-seg" role="group" aria-label="Prioridade">
              <button type="button" aria-pressed={form.priority === "normal"} onClick={() => set("priority", "normal")}>Normal</button>
              <button type="button" data-tone="out" aria-pressed={form.priority === "alta"} onClick={() => set("priority", "alta")}>Alta</button>
            </div>
            <div className="kb-seg" role="group" aria-label="Situação">
              <button type="button" aria-pressed={form.status === "todo"} onClick={() => set("status", "todo")}>A fazer</button>
              <button type="button" aria-pressed={form.status === "doing"} onClick={() => set("status", "doing")}>Fazendo</button>
              <button type="button" data-tone="in" aria-pressed={form.status === "done"} onClick={() => set("status", "done")}>Feita</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="kb-field">
                <span>Projeto</span>
                <select className="kb-control" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
                  <option value="">Nenhum</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="kb-field">
                <span>Cliente</span>
                <select className="kb-control" value={form.contactId} onChange={(e) => set("contactId", e.target.value)}>
                  <option value="">Nenhum</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="kb-field">
              <span>Detalhes</span>
              <textarea className="kb-control" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Links, referências, o que o cliente pediu…" />
            </label>
            {formError && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{formError}</p>}
            <div className="flex gap-3 pt-1">
              {form.id && (
                <button type="button" className="kb-btn-ghost text-[var(--kb-late)]!" onClick={remove}>
                  Excluir
                </button>
              )}
              <button type="submit" disabled={saving} className="kb-btn flex-1">
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
