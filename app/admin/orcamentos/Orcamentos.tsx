"use client";
import { maskDocumentInput } from "@/lib/kbos/document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUDGET_STATUS, DEFAULT_PIX_INFO } from "@/lib/kbos/constants";
import {
  PAYMENT_CONDITIONS,
  calcDiscountAmount,
  calcPaymentOptions,
  formatBRL as brl,
  type PaymentCondition,
} from "@/lib/kbos/budget-calc";

type Item = { service: string; description?: string | null; quantity: number; unitPrice: number; total: number; date?: string | null };
type Budget = {
  id: string;
  code: string;
  contactId: string | null;
  title: string;
  status: string;
  totalAmount: string;
  validUntil: string | null;
  terms: string | null;
  bankInfo: string | null;
  items: Item[];
  clientName?: string | null;
  clientCompany?: string | null;
  clientDocument?: string | null;
  eventDates?: string[] | null;
  discountType?: string | null;
  discountValue?: string | number | null;
  paymentCondition?: string | null;
  deliveryDeadline?: string | null;
  revisionsCount?: number | null;
  createdAt: string;
  contactName?: string | null;
  contactCompany?: string | null;
};
type Contact = { id: string; name: string; company: string | null; phone?: string | null; email?: string | null; document?: string | null };

const num = (v: unknown): number => {
  if (typeof v === "string") v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const STATUS_LABEL: Record<string, string> = Object.fromEntries(BUDGET_STATUS.map((s) => [s.id, s.label]));
const STATUS_STYLE: Record<string, string> = {
  draft: "border-white/15 bg-white/[0.04] text-white/70",
  sent: "border-sky-300/30 bg-sky-400/10 text-sky-200",
  approved: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  completed: "border-violet-300/30 bg-violet-400/10 text-violet-200",
  cancelled: "border-white/15 bg-white/[0.02] text-white/40",
  rejected: "border-red-300/30 bg-red-400/10 text-red-200",
};


const emptyItem = (): Item => ({ service: "", description: "", quantity: 1, unitPrice: 0, total: 0 });
type FormState = {
  title: string;
  contactId: string;
  company: string;
  responsible: string;
  document: string;
  items: Item[];
  discountType: "fixed" | "percent";
  discountValue: string;
  paymentCondition: PaymentCondition;
  deliveryDeadline: string;
  revisionsCount: string;
  status: string;
  validUntil: string;
  terms: string;
  bankInfo: string;
};
const blankForm = (): FormState => ({
  title: "",
  contactId: "",
  company: "",
  responsible: "",
  document: "",
  items: [emptyItem()],
  discountType: "fixed",
  discountValue: "",
  paymentCondition: "cash",
  deliveryDeadline: "",
  revisionsCount: "",
  status: "draft",
  validUntil: "",
  terms: "",
  bankInfo: DEFAULT_PIX_INFO,
});

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/40";
const labelCls = "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-white/45";
const sectionCls = "rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5";
const sectionTitleCls = "mb-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/50";

export default function Orcamentos() {
  const [items, setItems] = useState<Budget[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  // Autocomplete do responsável + cadastro rápido de cliente.
  const [respOpen, setRespOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [qa, setQa] = useState({ name: "", company: "", phone: "", email: "" });
  const [qaSaving, setQaSaving] = useState(false);
  const [qaError, setQaError] = useState("");
  const respBlur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([
        fetch("/api/budgets").then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
        fetch("/api/contacts").then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
      ]);
      if (!b.ok) throw new Error(b.j.error || "Falha ao carregar orçamentos.");
      setItems(b.j.items || []);
      if (c.ok) setContacts((c.j.items || []).map((x: Contact) => ({ id: x.id, name: x.name, company: x.company, phone: x.phone, email: x.email, document: x.document })));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    void load();
  }, [load]);

  const shown = useMemo(() => items.filter((b) => filter === "all" || b.status === filter), [items, filter]);
  const summary = useMemo(() => {
    const open = items.filter((b) => b.status === "draft" || b.status === "sent");
    const closed = items.filter((b) => b.status === "approved" || b.status === "completed");
    const sum = (xs: Budget[]) => xs.reduce((a, b) => a + Number(b.totalAmount || 0), 0);
    return { openCount: open.length, openValue: sum(open), closedCount: closed.length, closedValue: sum(closed) };
  }, [items]);
  // Sugestões: serviços já usados em orçamentos + empresas do CRM.
  const serviceHints = useMemo(() => {
    const seen = new Set<string>();
    for (const b of items) for (const it of b.items || []) if (it.service.trim()) seen.add(it.service.trim());
    return [...seen].slice(0, 60);
  }, [items]);
  const companyHints = useMemo(() => {
    const seen = new Set<string>();
    for (const c of contacts) if (c.company?.trim()) seen.add(c.company.trim());
    for (const b of items) if (b.clientCompany?.trim()) seen.add(b.clientCompany.trim());
    return [...seen].slice(0, 60);
  }, [contacts, items]);

  // Totais do formulário: mesma regra do servidor (`budget-calc.ts`).
  const subtotal = useMemo(
    () => form.items.reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0),
    [form.items]
  );
  const discountAmount = useMemo(
    () => calcDiscountAmount(subtotal, form.discountType, num(form.discountValue)),
    [form.discountValue, form.discountType, subtotal]
  );
  const formTotal = Math.round((subtotal - discountAmount) * 100) / 100;

  const linkedContact = contacts.find((c) => c.id === form.contactId) || null;
  const respMatches = useMemo(() => {
    const q = form.responsible.trim().toLowerCase();
    if (!q) return contacts.slice(0, 6);
    return contacts
      .filter((c) => c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [contacts, form.responsible]);

  const openNew = () => {
    setEditing(null);
    setForm(blankForm());
    setQuickAdd(false);
    setModal(true);
  };
  const openEdit = (b: Budget) => {
    setEditing(b);
    const dv = Number(b.discountValue || 0);
    // Legado: orçamentos com lista global de datas distribuem uma por item.
    const legacyDates = (b.eventDates || []).filter(Boolean);
    const items = b.items.length ? b.items.map((i) => ({ ...i })) : [emptyItem()];
    items.forEach((it, idx) => {
      if (!it.date && legacyDates[idx]) it.date = legacyDates[idx];
    });
    setForm({
      title: b.title,
      contactId: b.contactId || "",
      company: b.contactCompany || b.clientCompany || "",
      responsible: b.contactName || b.clientName || "",
      document: b.clientDocument || contacts.find((c) => c.id === b.contactId)?.document || "",
      items,
      discountType: b.discountType === "percent" ? "percent" : "fixed",
      discountValue: dv ? String(dv).replace(".", ",") : "",
      paymentCondition:
        b.paymentCondition === "installments" || b.paymentCondition === "card" ? b.paymentCondition : "cash",
      deliveryDeadline: b.deliveryDeadline || "",
      revisionsCount: b.revisionsCount != null ? String(b.revisionsCount) : "",
      status: b.status,
      validUntil: b.validUntil ? b.validUntil.slice(0, 10) : "",
      terms: b.terms || "",
      bankInfo: b.bankInfo || DEFAULT_PIX_INFO,
    });
    setQuickAdd(false);
    setModal(true);
  };

  const pickContact = (c: Contact) => {
    setForm((f) => ({ ...f, contactId: c.id, responsible: c.name, company: c.company || f.company, document: c.document || f.document }));
    setRespOpen(false);
  };

  const createQuickClient = async () => {
    if (!qa.name.trim()) {
      setQaError("Informe ao menos o nome do responsável.");
      return;
    }
    setQaSaving(true);
    setQaError("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: qa.name.trim(),
          company: qa.company.trim() || undefined,
          phone: qa.phone.trim() || undefined,
          email: qa.email.trim() || undefined,
          status: "client",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao cadastrar cliente.");
      const c: Contact = { id: j.item.id, name: j.item.name, company: j.item.company };
      setContacts((xs) => [c, ...xs]);
      pickContact(c);
      setQa({ name: "", company: "", phone: "", email: "" });
      setQuickAdd(false);
    } catch (e) {
      setQaError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setQaSaving(false);
    }
  };

  const setItem = (idx: number, patch: Partial<Item>) => {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };

  const save = async () => {
    const cleanItems = form.items
      .filter((i) => i.service.trim())
      .map((i) => ({
        service: i.service.trim(),
        description: i.description?.trim() || null,
        quantity: num(i.quantity) || 1,
        unitPrice: num(i.unitPrice),
        date: i.date || null,
      }));
    if (!form.title.trim() || cleanItems.length === 0) {
      setError("Informe o título da proposta e ao menos 1 item com descrição.");
      return;
    }
    // Resumo global derivado das datas por item (compatibilidade + PDF legado).
    const derivedDates = [...new Set(cleanItems.map((i) => i.date).filter((d): d is string => !!d))].sort();
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        contactId: form.contactId || null,
        clientName: form.responsible.trim() || null,
        clientCompany: form.company.trim() || null,
        clientDocument: form.document.trim() || null,
        items: cleanItems,
        eventDates: derivedDates.length ? derivedDates : null,
        discountType: form.discountType,
        discountValue: num(form.discountValue),
        paymentCondition: form.paymentCondition,
        deliveryDeadline: form.deliveryDeadline.trim() || null,
        revisionsCount: form.revisionsCount.trim() === "" ? null : Math.max(0, parseInt(form.revisionsCount, 10) || 0),
        status: form.status,
        validUntil: form.validUntil || null,
        terms: form.terms.trim() || null,
        bankInfo: form.bankInfo.trim() || null,
      };
      const res = await fetch(editing ? `/api/budgets/${editing.id}` : "/api/budgets", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao salvar.");
      setModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: Budget) => {
    if (!confirm(`Excluir o orçamento ${b.code}?`)) return;
    try {
      const res = await fetch(`/api/budgets/${b.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Falha.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  };

  const displayClient = (b: Budget) => b.contactName || b.clientName || "Sem cliente";
  const displayCompany = (b: Budget) => b.contactCompany || b.clientCompany || "";
  // Datas distintas: por item (novo) + lista global (legado).
  const budgetDateCount = (b: Budget) =>
    new Set([...(b.items || []).map((i) => i.date).filter(Boolean), ...((b.eventDates || []).filter(Boolean))]).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", label: "Todos" }, ...BUDGET_STATUS].map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === s.id ? "border-white/50 bg-white/10" : "border-white/10 text-white/50 hover:border-white/30"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={openNew}
          className="ml-auto rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-mag/20 transition hover:opacity-90 active:scale-95"
        >
          + Novo orçamento
        </button>
      </div>

      {error ? <p className="rounded-xl border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-200">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">❐ Em aberto</p>
          <p className="font-display mt-2 text-3xl font-light">{summary.openCount}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{brl(summary.openValue)} em rascunho/enviados</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.05] p-5">
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-200/60">✓ Fechados</p>
          <p className="font-display mt-2 text-3xl font-light">{summary.closedCount}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{brl(summary.closedValue)} aprovados/concluídos</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/40">◔ Total</p>
          <p className="font-display mt-2 text-3xl font-light">{items.length}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">orçamentos no período</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-widest text-white/40">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Título / Cliente</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Validade</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-white/90">{b.code}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs text-white/45">
                    {displayClient(b)}
                    {displayCompany(b) ? ` · ${displayCompany(b)}` : ""} · {b.items.length} item(ns)
                    {budgetDateCount(b) > 0 ? ` · ${budgetDateCount(b)} data(s)` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-medium">{brl(b.totalAmount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[b.status] || STATUS_STYLE.draft}`}>
                    {STATUS_LABEL[b.status] ?? b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/60">
                  {b.validUntil ? new Date(b.validUntil).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2 text-xs">
                    <a
                      href={`/api/budgets/${b.id}/pdf`}
                      className="rounded-lg border border-white/15 px-2.5 py-1 hover:border-white/40"
                    >
                      PDF
                    </a>
                    <button
                      onClick={() => openEdit(b)}
                      className="rounded-lg border border-white/15 px-2.5 py-1 hover:border-white/40"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => void remove(b)}
                      className="rounded-lg border border-red-300/25 px-2.5 py-1 text-red-200 hover:border-red-300/60"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-white/40">
                  Nenhum orçamento. Clique em “Novo orçamento” ou peça ao assistente: “criar orçamento site para Maria: página 3000, blog 800”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-4">
          <div className="my-4 w-full max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-[#14141c] p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-xl font-light">{editing ? `Editar ${editing.code}` : "Novo orçamento"}</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[form.status] || STATUS_STYLE.draft}`}>
                {STATUS_LABEL[form.status]}
              </span>
            </div>

            {/* ── 1 · CLIENTE ─────────────────────────────── */}
            <section className={sectionCls}>
              <p className={sectionTitleCls}>1 · Cliente</p>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className={labelCls} htmlFor="orc-title">Título da proposta</label>
                  <input
                    id="orc-title"
                    className={inputCls}
                    placeholder="Ex.: Cobertura audiovisual — Casamento Ana & Rafa"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="orc-company">Empresa</label>
                    <input
                      id="orc-company"
                      className={inputCls}
                      list="orc-company-hints"
                      placeholder="Ex.: Produtora Manafest"
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    />
                    <datalist id="orc-company-hints">
                      {companyHints.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <div className="relative">
                    <label className={labelCls} htmlFor="orc-resp">Responsável</label>
                    <input
                      id="orc-resp"
                      className={inputCls}
                      placeholder="Ex.: Maria Silva"
                      value={form.responsible}
                      autoComplete="off"
                      onFocus={() => setRespOpen(true)}
                      onBlur={() => {
                        respBlur.current = setTimeout(() => setRespOpen(false), 150);
                      }}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, responsible: e.target.value, contactId: "" }));
                        setRespOpen(true);
                      }}
                    />
                    {respOpen && respMatches.length > 0 ? (
                      <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-white/15 bg-[#1c1c2a] py-1 shadow-2xl">
                        {respMatches.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickContact(c)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-white/10"
                            >
                              <span>
                                <span className="block font-medium">{c.name}</span>
                                {c.company ? <span className="block text-xs text-white/50">{c.company}</span> : null}
                              </span>
                              <span className="text-[10px] uppercase tracking-widest text-white/30">CRM</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className={labelCls} htmlFor="orc-doc">CPF ou CNPJ do contratante</label>
                  <input
                    id="orc-doc"
                    className={inputCls}
                    placeholder="Sai no contrato (página 2)"
                    value={form.document}
                    inputMode="text"
                    autoCapitalize="characters"
                    onChange={(e) => setForm((f) => ({ ...f, document: maskDocumentInput(e.target.value) }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {linkedContact ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                      ✓ {linkedContact.name} vinculado ao CRM
                      <button
                        onClick={() => setForm((f) => ({ ...f, contactId: "" }))}
                        className="text-emerald-200/60 hover:text-emerald-100"
                        aria-label="Desvincular cliente"
                      >
                        ×
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-white/40">Digitando livremente ou escolha um cliente do CRM acima.</span>
                  )}
                  <button
                    onClick={() => {
                      setQaError("");
                      setQa((q) => ({ ...q, name: q.name || form.responsible, company: q.company || form.company }));
                      setQuickAdd((v) => !v);
                    }}
                    className="ml-auto rounded-xl border border-dashed border-white/25 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/60 hover:text-white"
                  >
                    + Adicionar cliente
                  </button>
                </div>
                {quickAdd ? (
                  <div className="rounded-xl border border-white/15 bg-black/30 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-white/50">Cadastro rápido</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className={inputCls}
                        placeholder="Responsável *"
                        value={qa.name}
                        onChange={(e) => setQa((q) => ({ ...q, name: e.target.value }))}
                      />
                      <input
                        className={inputCls}
                        placeholder="Empresa"
                        value={qa.company}
                        onChange={(e) => setQa((q) => ({ ...q, company: e.target.value }))}
                      />
                      <input
                        className={inputCls}
                        placeholder="Telefone / WhatsApp"
                        value={qa.phone}
                        onChange={(e) => setQa((q) => ({ ...q, phone: e.target.value }))}
                      />
                      <input
                        className={inputCls}
                        placeholder="E-mail"
                        value={qa.email}
                        onChange={(e) => setQa((q) => ({ ...q, email: e.target.value }))}
                      />
                    </div>
                    {qaError ? <p className="mt-2 text-xs text-red-300">{qaError}</p> : null}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setQuickAdd(false)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:border-white/40"
                      >
                        Fechar
                      </button>
                      <button
                        onClick={() => void createQuickClient()}
                        disabled={qaSaving}
                        className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
                      >
                        {qaSaving ? "Salvando…" : "Cadastrar e vincular"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {/* ── 2 · ITENS + DATAS ───────────────────────── */}
            <section className={sectionCls}>
              <p className={sectionTitleCls}>2 · Itens e datas de execução</p>
              <p className="mt-1 text-xs text-white/35">Uma data por item — ideal para coberturas em dias diferentes.</p>
              <div className="mt-3 space-y-2">
                {form.items.map((it, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-xl border border-white/5 bg-black/20 p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        className={inputCls}
                        list="orc-service-hints"
                        placeholder={`Serviço ${i + 1} — ex.: Cobertura fotográfica`}
                        value={it.service}
                        onChange={(e) => setItem(i, { service: e.target.value })}
                      />
                      <button
                        onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                        className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-white/50 hover:border-red-300/50 hover:text-red-200"
                        disabled={form.items.length <= 1}
                        aria-label="Remover item"
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[150px_76px_1fr_110px] sm:items-center">
                      <input
                        className={inputCls}
                        type="date"
                        aria-label={`Data de execução do item ${i + 1}`}
                        title="Data de execução"
                        value={it.date || ""}
                        onChange={(e) => setItem(i, { date: e.target.value || null })}
                      />
                      <input
                        className={inputCls}
                        type="number"
                        min={1}
                        placeholder="Qtd"
                        aria-label="Quantidade"
                        value={it.quantity}
                        onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
                      />
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Valor unit. (R$)"
                        aria-label="Valor unitário"
                        value={it.unitPrice || ""}
                        onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })}
                      />
                      <span className="text-right text-sm font-medium text-white/80 max-sm:col-span-2">
                        {brl(num(it.quantity) * num(it.unitPrice))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <datalist id="orc-service-hints">
                {serviceHints.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <button
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="mt-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-xs text-white/70 transition-colors hover:border-white/50 hover:text-white"
              >
                + Adicionar novo item
              </button>
            </section>

            {/* ── 3 · VALORES + PAGAMENTO ─────────────────── */}
            <section className={sectionCls}>
              <p className={sectionTitleCls}>3 · Valores, status e pagamento</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm">
                  <span className="text-white/50">Subtotal</span>
                  <strong className="float-right">{brl(subtotal)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl border border-white/10 p-0.5 text-xs" role="group" aria-label="Tipo de desconto">
                    {(["fixed", "percent"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setForm((f) => ({ ...f, discountType: t }))}
                        className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                          form.discountType === t ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
                        }`}
                      >
                        {t === "fixed" ? "R$" : "%"}
                      </button>
                    ))}
                  </div>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={form.discountType === "percent" ? "Desconto %" : "Desconto R$"}
                    aria-label="Desconto"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value.replace(/[^\d.,]/g, "") }))}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-mag/30 bg-brand-mag/[0.06] px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-mag">
                  Total{discountAmount > 0 ? ` (−${brl(discountAmount)})` : ""}
                </span>
                <strong className="font-display text-2xl font-light text-white">{brl(formTotal)}</strong>
              </div>

              <div className="mt-3">
                <span className={labelCls}>Condição de pagamento preferida</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PAYMENT_CONDITIONS.map((p) => {
                    const active = form.paymentCondition === p.id;
                    const v = calcPaymentOptions(formTotal);
                    const value =
                      p.id === "cash" ? brl(v.cash) : p.id === "installments" ? `2× ${brl(v.entry)}` : brl(formTotal);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setForm((f) => ({ ...f, paymentCondition: p.id }))}
                        aria-pressed={active}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-emerald-300/50 bg-emerald-400/10"
                            : "border-white/10 bg-black/20 hover:border-white/30"
                        }`}
                      >
                        <span className="flex items-center justify-between text-sm font-medium">
                          {p.label}
                          <span className={active ? "text-emerald-300" : "text-white/30"}>{active ? "✓" : ""}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-white/45">{p.hint}</span>
                        <span className="mt-1 block text-sm font-semibold text-white/90">{value}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="orc-deadline">Prazo de entrega</label>
                  <input
                    id="orc-deadline"
                    className={inputCls}
                    placeholder="Ex.: 15 dias úteis"
                    value={form.deliveryDeadline}
                    onChange={(e) => setForm((f) => ({ ...f, deliveryDeadline: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="orc-rev">Revisões inclusas</label>
                  <input
                    id="orc-rev"
                    className={inputCls}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Ex.: 2"
                    value={form.revisionsCount}
                    onChange={(e) => setForm((f) => ({ ...f, revisionsCount: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="orc-valid">Validade do orçamento</label>
                  <input
                    id="orc-valid"
                    className={inputCls}
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                  />
                </div>
                <div>
                  <span className={labelCls}>Status</span>
                  <div className="flex flex-wrap gap-1.5">
                    {BUDGET_STATUS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          form.status === s.id
                            ? "border-white/60 bg-white/15 text-white"
                            : "border-white/10 text-white/50 hover:border-white/30 hover:text-white/80"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <label className={labelCls} htmlFor="orc-pix">Dados bancários / chave Pix</label>
                <textarea
                  id="orc-pix"
                  className={`${inputCls} min-h-[48px]`}
                  value={form.bankInfo}
                  onChange={(e) => setForm((f) => ({ ...f, bankInfo: e.target.value }))}
                />
              </div>
              <div className="mt-3">
                <label className={labelCls} htmlFor="orc-terms">Termos, condições e informações adicionais</label>
                <textarea
                  id="orc-terms"
                  className={`${inputCls} min-h-[88px]`}
                  placeholder="Validade da proposta, condições de pagamento (entrada + restante), nº de revisões inclusas, prazos de entrega, deslocamento, horas extras…"
                  value={form.terms}
                  onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
                />
              </div>
            </section>

            <div className="sticky bottom-0 flex justify-end gap-2 rounded-2xl border border-white/10 bg-[#14141c]/95 p-2 backdrop-blur">
              <button
                onClick={() => setModal(false)}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:border-white/40"
              >
                Cancelar
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-mag/20 transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              >
                {saving ? "Salvando…" : editing ? `Salvar · ${brl(formTotal)}` : `Criar orçamento · ${brl(formTotal)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
