"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Entry = {
  id: string;
  type: "income" | "expense";
  description: string;
  amount: number;
  category: string | null;
  dueDate: string | null;
  status: "pending" | "paid" | "overdue";
  scope: "empresa" | "pessoal";
  paymentMethod: string | null;
  recurrence: "mensal" | "anual" | null;
  contactId: string | null;
  notes: string | null;
  createdAt: string;
};

type Summary = { income: number; expenses: number; balance: number; receivable: number; payable: number };
type CashPoint = { key: string; label: string; income: number; expenses: number };
type ContactLite = { id: string; name: string; company: string | null; status: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "");

const PAYMENT_METHODS = ["Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência", "Dinheiro"];
const CATEGORY_HINTS = {
  expense: ["Assinaturas", "Ferramentas", "Equipamento", "Transporte", "Alimentação", "Impostos", "Aluguel", "Freelancer", "Marketing", "Casa", "Saúde"],
  income: ["Pacote mensal", "Projeto avulso", "Cobertura de evento", "Curso", "Consultoria", "Reembolso"],
};

type Form = {
  id: string | null;
  type: "income" | "expense";
  description: string;
  amount: string;
  dueDate: string;
  status: "pending" | "paid";
  scope: "empresa" | "pessoal";
  category: string;
  paymentMethod: string;
  recurrence: "" | "mensal" | "anual";
  contactId: string;
  notes: string;
};

const blank = (scope: "empresa" | "pessoal", type: "income" | "expense" = "expense"): Form => ({
  id: null,
  type,
  description: "",
  amount: "",
  dueDate: todayISO(),
  status: "paid",
  scope,
  category: "",
  paymentMethod: "Pix",
  recurrence: "",
  contactId: "",
  notes: "",
});

/** "1234.5" → "1.234,50" para o campo; aceita o que o usuário digitar. */
const toFieldMoney = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CashChart({ data }: { data: CashPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]));
  return (
    <div>
      <div className="flex h-36 items-end gap-3 md:h-44" role="img" aria-label="Receitas e despesas pagas nos últimos 6 meses">
        {data.map((d) => (
          <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex min-h-0 w-full max-w-[56px] flex-1 items-end justify-center gap-1">
              <div className="w-full rounded-t-md bg-[var(--kb-good)] opacity-80 transition-all duration-500" style={{ height: `${Math.max(2, (d.income / max) * 100)}%` }} title={`Receitas: ${brl(d.income)}`} />
              <div className="w-full rounded-t-md bg-[var(--kb-late-dot)] opacity-70 transition-all duration-500" style={{ height: `${Math.max(2, (d.expenses / max) * 100)}%` }} title={`Despesas: ${brl(d.expenses)}`} />
            </div>
            <span className="kb-faint truncate text-[11px] capitalize">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="kb-muted mt-2 flex gap-4 text-[12px]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--kb-good)]" /> Entrou</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--kb-late-dot)]" /> Saiu</span>
      </div>
    </div>
  );
}

export default function Financeiro() {
  const [items, setItems] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expenses: 0, balance: 0, receivable: 0, payable: 0 });
  const [cash, setCash] = useState<CashPoint[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<"empresa" | "pessoal" | "all">("empresa");
  const [view, setView] = useState<"all" | "income" | "expense" | "open">("all");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance?scope=${scope}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items || []);
      setSummary(data.summary);
      setCash(data.cashFlow || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [scope]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => {
        const list: ContactLite[] = (d.items || d.contacts || []).filter((c: ContactLite) => c.status !== "archived");
        setContacts(list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      })
      .catch(() => {});
  }, []);

  // Atalho do Hoje: /admin/financeiro?novo=despesa|entrada abre a folha direto.
  useEffect(() => {
    const novo = new URLSearchParams(window.location.search).get("novo");
    if (novo === "despesa" || novo === "entrada") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- abre a folha uma vez, vindo do atalho.
      setForm(blank("empresa", novo === "entrada" ? "income" : "expense"));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const shown = useMemo(() => {
    if (view === "income") return items.filter((e) => e.type === "income");
    if (view === "expense") return items.filter((e) => e.type === "expense");
    if (view === "open") return items.filter((e) => e.status !== "paid");
    return items;
  }, [items, view]);

  const categories = useMemo(() => {
    const t = form?.type ?? "expense";
    const used = items.filter((e) => e.type === t && e.category).map((e) => e.category as string);
    return [...new Set([...used, ...CATEGORY_HINTS[t]])];
  }, [items, form?.type]);

  function openNew(type: "income" | "expense" = "expense") {
    setFormError("");
    setMore(false);
    setForm(blank(scope === "pessoal" ? "pessoal" : "empresa", type));
  }

  function openEdit(e: Entry) {
    setFormError("");
    setMore(!!(e.notes || e.contactId));
    setForm({
      id: e.id,
      type: e.type,
      description: e.description,
      amount: toFieldMoney(e.amount),
      dueDate: e.dueDate ? e.dueDate.slice(0, 10) : "",
      status: e.status === "paid" ? "paid" : "pending",
      scope: e.scope,
      category: e.category ?? "",
      paymentMethod: e.paymentMethod ?? "",
      recurrence: e.recurrence ?? "",
      contactId: e.contactId ?? "",
      notes: e.notes ?? "",
    });
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError("");
    const body = {
      type: form.type,
      description: form.description.trim(),
      amount: form.amount.trim(),
      category: form.category.trim() || (form.id ? null : undefined),
      // Meio-dia UTC: a data não "volta um dia" no fuso de Belém.
      dueDate: form.dueDate ? `${form.dueDate}T12:00:00.000Z` : form.id ? null : undefined,
      status: form.status,
      scope: form.scope,
      paymentMethod: form.paymentMethod || (form.id ? null : undefined),
      recurrence: form.recurrence || null,
      contactId: form.contactId || (form.id ? null : undefined),
      notes: form.notes.trim() || (form.id ? null : undefined),
    };
    try {
      const res = await fetch(form.id ? `/api/finance/${form.id}` : "/api/finance", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Não consegui salvar.");
      setForm(null);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(e: Entry) {
    const next = e.status === "paid" ? "pending" : "paid";
    setItems((s) => s.map((x) => (x.id === e.id ? { ...x, status: next } : x)));
    await fetch(`/api/finance/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function remove() {
    if (!form?.id || !confirm("Excluir este lançamento?")) return;
    await fetch(`/api/finance/${form.id}`, { method: "DELETE" });
    setForm(null);
    load();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-4">
      {error && <div className="kb-tag late w-full justify-start rounded-2xl! px-4! py-3! text-sm">{error}</div>}

      {/* Visão: empresa × pessoal */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="kb-seg min-w-[260px] flex-1 sm:flex-none" role="group" aria-label="Visão do caixa">
          {(
            [
              ["empresa", "Empresa"],
              ["pessoal", "Pessoal"],
              ["all", "Tudo"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto hidden gap-2 sm:flex">
          <button type="button" className="kb-btn-ghost" onClick={() => openNew("income")}>+ Entrada</button>
          <button type="button" className="kb-btn" onClick={() => openNew("expense")}>+ Despesa</button>
        </div>
      </div>

      {/* Resumo */}
      <section className="kb-glass grid grid-cols-2 gap-px overflow-hidden p-0! sm:grid-cols-5">
        {[
          { k: "Saldo do período", v: summary.balance, c: summary.balance < 0 ? "text-[var(--kb-late)]" : "kb-ink", wide: true },
          { k: "Entrou", v: summary.income, c: "text-[var(--kb-good)]" },
          { k: "Saiu", v: summary.expenses, c: "text-[var(--kb-late)]" },
          { k: "A receber", v: summary.receivable, c: "text-[var(--kb-soon)]" },
          { k: "A pagar", v: summary.payable, c: "text-[var(--kb-soon)]" },
        ].map((s) => (
          <div key={s.k} className={`bg-[var(--kb-chip)] p-4 ${s.wide ? "col-span-2 sm:col-span-1" : ""}`}>
            <p className="kb-muted text-[12px]">{s.k}</p>
            <p className={`font-display mt-1 text-xl tabular-nums md:text-2xl ${s.c}`}>{brl(s.v)}</p>
          </div>
        ))}
      </section>

      <section className="kb-glass p-5">
        <p className="kb-muted text-[12px]">Fluxo dos últimos 6 meses</p>
        <div className="mt-3">
          <CashChart data={cash} />
        </div>
      </section>

      {/* Filtros */}
      <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
        {(
          [
            ["all", "Tudo"],
            ["open", "Em aberto"],
            ["income", "Entradas"],
            ["expense", "Despesas"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="kb-chip" aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Lançamentos */}
      <section className="kb-glass px-4 py-1">
        {shown.map((t) => (
          <div key={t.id} className="kb-row">
            <button type="button" onClick={() => openEdit(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.type === "income" ? "bg-[var(--kb-good)]" : "bg-[var(--kb-late-dot)]"}`} />
              <span className="min-w-0 flex-1">
                <span className="kb-ink block truncate text-[15px]">
                  {t.description}
                  {t.recurrence ? <span className="kb-faint" title={`Repete ${t.recurrence}`}> ↻</span> : null}
                </span>
                <span className="kb-faint block truncate text-[12px]">
                  {[t.dueDate ? dayLabel(t.dueDate) : null, t.category, t.paymentMethod, scope === "all" ? (t.scope === "pessoal" ? "Pessoal" : "Empresa") : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`text-[15px] font-semibold tabular-nums ${t.type === "income" ? "text-[var(--kb-good)]" : "kb-ink"}`}>
                {t.type === "income" ? "+" : "−"} {brl(Number(t.amount))}
              </span>
              <button
                type="button"
                onClick={() => markPaid(t)}
                className={`kb-tag ${t.status === "overdue" ? "late" : t.status === "pending" ? "soon" : ""}`}
                aria-label={t.status === "paid" ? "Marcar como pendente" : "Marcar como pago"}
              >
                {t.status === "paid" ? "✓ Pago" : t.status === "overdue" ? "Vencido · pagar" : "Pendente · pagar"}
              </button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="kb-muted py-10 text-center text-sm">Nada por aqui ainda. Toque em + para lançar.</p>}
      </section>

      {/* Ação rápida no celular, acima da tab bar */}
      <button
        type="button"
        onClick={() => openNew("expense")}
        aria-label="Novo lançamento"
        className="kb-mic fixed right-4 z-[65] h-14! w-14! text-2xl sm:hidden"
        style={{ bottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
      >
        +
      </button>

      {form && (
        <div className="kb-modal-back" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" aria-label={form.id ? "Editar lançamento" : "Novo lançamento"}>
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">{form.id ? "Editar lançamento" : "Novo lançamento"}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>

            <div className="kb-seg" role="group" aria-label="Tipo">
              <button type="button" data-tone="out" aria-pressed={form.type === "expense"} onClick={() => set("type", "expense")}>↓ Despesa</button>
              <button type="button" data-tone="in" aria-pressed={form.type === "income"} onClick={() => set("type", "income")}>↑ Entrada</button>
            </div>

            <label className="kb-field">
              <span>Descrição</span>
              <input className="kb-control" value={form.description} onChange={(e) => set("description", e.target.value)} required placeholder={form.type === "expense" ? "Ex.: Google Drive" : "Ex.: Mensalidade Pará Super Foods"} autoComplete="off" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field">
                <span>Valor (R$)</span>
                <input className="kb-control tabular-nums" value={form.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))} required inputMode="decimal" placeholder="0,00" />
              </label>
              <label className="kb-field">
                <span>{form.status === "paid" ? "Data" : "Vencimento"}</span>
                <input className="kb-control" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              </label>
            </div>

            <div className="kb-seg" role="group" aria-label="Situação">
              <button type="button" aria-pressed={form.status === "paid"} onClick={() => set("status", "paid")}>{form.type === "income" ? "Recebido" : "Pago"}</button>
              <button type="button" aria-pressed={form.status === "pending"} onClick={() => set("status", "pending")}>{form.type === "income" ? "A receber" : "A pagar"}</button>
            </div>

            <div className="kb-seg" role="group" aria-label="Conta">
              <button type="button" aria-pressed={form.scope === "empresa"} onClick={() => set("scope", "empresa")}>Empresa</button>
              <button type="button" aria-pressed={form.scope === "pessoal"} onClick={() => set("scope", "pessoal")}>Pessoal</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field">
                <span>Categoria</span>
                <input className="kb-control" list="kb-cats" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Escolha ou digite" />
                <datalist id="kb-cats">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="kb-field">
                <span>Forma</span>
                <select className="kb-control" value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                  <option value="">—</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="kb-field">
              <span>Repete</span>
              <select className="kb-control" value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as Form["recurrence"])}>
                <option value="">Não repete</option>
                <option value="mensal">Todo mês (assinatura, mensalidade)</option>
                <option value="anual">Todo ano</option>
              </select>
            </label>

            {!more ? (
              <button type="button" className="kb-muted text-sm underline underline-offset-4" onClick={() => setMore(true)}>
                + Cliente/fornecedor e observações
              </button>
            ) : (
              <>
                <label className="kb-field">
                  <span>{form.type === "income" ? "Cliente" : "Fornecedor"}</span>
                  <select className="kb-control" value={form.contactId} onChange={(e) => set("contactId", e.target.value)}>
                    <option value="">Nenhum</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` · ${c.company}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="kb-field">
                  <span>Observações</span>
                  <textarea className="kb-control" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Nota fiscal, parcela 2/5, etc." />
                </label>
              </>
            )}

            {formError && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{formError}</p>}

            <div className="flex gap-3 pt-1">
              {form.id && (
                <button type="button" className="kb-btn-ghost text-[var(--kb-late)]!" onClick={remove}>
                  Excluir
                </button>
              )}
              <button type="submit" disabled={saving} className="kb-btn flex-1">
                {saving ? "Salvando…" : form.id ? "Salvar" : "Lançar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
