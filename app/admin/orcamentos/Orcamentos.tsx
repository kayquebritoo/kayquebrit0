"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BUDGET_STATUS } from "@/lib/kbos/constants";

type Item = { service: string; description?: string | null; quantity: number; unitPrice: number; total: number };
type Budget = {
  id: string;
  code: string;
  contactId: string | null;
  title: string;
  status: "draft" | "sent" | "approved" | "rejected";
  totalAmount: string;
  validUntil: string | null;
  terms: string | null;
  bankInfo: string | null;
  items: Item[];
  createdAt: string;
  contactName?: string | null;
  contactCompany?: string | null;
};
type Contact = { id: string; name: string; company: string | null };

const brl = (v: number | string) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS_LABEL: Record<string, string> = Object.fromEntries(BUDGET_STATUS.map((s) => [s.id, s.label]));
const STATUS_STYLE: Record<string, string> = {
  draft: "border-white/15 bg-white/[0.04] text-white/70",
  sent: "border-sky-300/30 bg-sky-400/10 text-sky-200",
  approved: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  rejected: "border-red-300/30 bg-red-400/10 text-red-200",
};

const emptyItem = (): Item => ({ service: "", description: "", quantity: 1, unitPrice: 0, total: 0 });
const emptyForm = {
  title: "",
  contactId: "",
  items: [emptyItem()] as Item[],
  status: "draft",
  validUntil: "",
  terms: "",
  bankInfo: "",
};

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/25 focus:border-white/40";

export default function Orcamentos() {
  const [items, setItems] = useState<Budget[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([
        fetch("/api/budgets").then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
        fetch("/api/contacts").then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
      ]);
      if (!b.ok) throw new Error(b.j.error || "Falha ao carregar orçamentos.");
      setItems(b.j.items || []);
      if (c.ok) setContacts((c.j.items || []).map((x: Contact) => ({ id: x.id, name: x.name, company: x.company })));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => items.filter((b) => filter === "all" || b.status === filter), [items, filter]);
  const summary = useMemo(() => {
    const open = items.filter((b) => b.status === "draft" || b.status === "sent");
    const approved = items.filter((b) => b.status === "approved");
    const sum = (xs: Budget[]) => xs.reduce((a, b) => a + Number(b.totalAmount || 0), 0);
    return {
      openCount: open.length,
      openValue: sum(open),
      approvedCount: approved.length,
      approvedValue: sum(approved),
    };
  }, [items]);
  const formTotal = useMemo(
    () => form.items.reduce((a, i) => a + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0),
    [form.items]
  );

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };
  const openEdit = (b: Budget) => {
    setEditing(b);
    setForm({
      title: b.title,
      contactId: b.contactId || "",
      items: b.items.length ? b.items.map((i) => ({ ...i })) : [emptyItem()],
      status: b.status,
      validUntil: b.validUntil ? b.validUntil.slice(0, 10) : "",
      terms: b.terms || "",
      bankInfo: b.bankInfo || "",
    });
    setModal(true);
  };

  const setItem = (idx: number, patch: Partial<Item>) => {
    setForm((f) => {
      const next = f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...f, items: next };
    });
  };

  const save = async () => {
    const cleanItems = form.items
      .filter((i) => i.service.trim())
      .map((i) => ({
        service: i.service.trim(),
        description: i.description?.trim() || null,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
      }));
    if (!form.title.trim() || cleanItems.length === 0) {
      setError("Informe o título e ao menos 1 item com serviço.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        contactId: form.contactId || null,
        items: cleanItems,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
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
          className="ml-auto rounded-xl border border-white/20 px-4 py-2 text-sm transition-colors hover:border-white/50"
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
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-200/60">✓ Aprovados</p>
          <p className="font-display mt-2 text-3xl font-light">{summary.approvedCount}</p>
          <p className="mt-1 text-[13px] font-light text-white/50">{brl(summary.approvedValue)} fechados</p>
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
                    {b.contactName || "Sem cliente"}
                    {b.contactCompany ? ` · ${b.contactCompany}` : ""} · {b.items.length} item(ns)
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-medium">{brl(b.totalAmount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-[#14141c] p-6">
            <p className="font-display text-xl font-light">{editing ? `Editar ${editing.code}` : "Novo orçamento"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputCls}
                placeholder="Título (ex.: Site institucional)"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              <select
                className={inputCls}
                value={form.contactId}
                onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
              >
                <option value="">Sem cliente</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` — ${c.company}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-white/40">Itens</p>
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_110px_110px_32px] items-center gap-2">
                  <input
                    className={inputCls}
                    placeholder="Serviço"
                    value={it.service}
                    onChange={(e) => setItem(i, { service: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    placeholder="Qtd"
                    value={it.quantity}
                    onChange={(e) => setItem(i, { quantity: Number(e.target.value) })}
                  />
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Valor unit."
                    value={it.unitPrice}
                    onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })}
                  />
                  <span className="text-right text-sm text-white/70">
                    {brl(Number(it.quantity || 0) * Number(it.unitPrice || 0))}
                  </span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                    className="rounded-lg border border-white/10 px-1 py-1 text-white/50 hover:border-red-300/50 hover:text-red-200"
                    disabled={form.items.length <= 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
                className="text-xs text-white/60 hover:text-white"
              >
                + Adicionar item
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {BUDGET_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                className={inputCls}
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                Total: <strong>{brl(formTotal)}</strong>
              </div>
            </div>

            <textarea
              className={`${inputCls} min-h-[64px]`}
              placeholder="Termos e condições (validade, pagamento, revisões…)"
              value={form.terms}
              onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
            />
            <textarea
              className={`${inputCls} min-h-[48px]`}
              placeholder="Dados bancários / chave PIX"
              value={form.bankInfo}
              onChange={(e) => setForm((f) => ({ ...f, bankInfo: e.target.value }))}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModal(false)}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:border-white/40"
              >
                Cancelar
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-50"
              >
                {saving ? "Salvando…" : editing ? "Salvar" : "Criar orçamento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
