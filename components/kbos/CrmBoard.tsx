"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTACT_STATUS } from "@/lib/kbos/constants";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  notes: string | null;
  updatedAt?: string;
};

const STATUS_LABEL: Record<string, string> = Object.fromEntries(CONTACT_STATUS.map((s) => [s.id, s.label]));
const FILTERS = [{ id: "all", label: "Todos" }, ...CONTACT_STATUS];

const emptyForm = { name: "", email: "", phone: "", company: "", status: "lead", notes: "" };

export default function CrmBoard() {
  const [items, setItems] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; item: Contact }>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [filter, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  function openCreate() {
    setForm(emptyForm);
    setModal({ mode: "create" });
  }
  function openEdit(item: Contact) {
    setForm({
      name: item.name || "",
      email: item.email || "",
      phone: item.phone || "",
      company: item.company || "",
      status: item.status || "lead",
      notes: item.notes || "",
    });
    setModal({ mode: "edit", item });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      };
      const isEdit = modal && "item" in modal;
      const res = await fetch(isEdit ? `/api/contacts/${(modal as { item: Contact }).item.id}` : "/api/contacts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha ao salvar.");
      setModal(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Arquivar este contato?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    load();
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of CONTACT_STATUS) c[s.id] = 0;
    return c;
  }, [items]);

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-sm text-rose-100">{error}</div>
      )}

      {/* Filtros rápidos + busca + novo */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-[12px] uppercase tracking-[0.12em] transition-all duration-200 active:scale-95 ${
                filter === f.id ? "bg-white font-bold text-black" : "border border-white/15 text-white/65 hover:border-white/40 hover:text-white"
              }`}
            >
              {f.label}
              {f.id !== "all" && counts[f.id] ? ` · ${counts[f.id]}` : ""}
            </button>
          ))}
          <button
            onClick={openCreate}
            className="ml-auto rounded-xl bg-white px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-95"
          >
            + Novo contato
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, e-mail ou empresa..."
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50"
        />
      </div>

      {/* Tabela (desktop) / cards (mobile) */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.2em] text-white/40">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium">Contato</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{c.name}</p>
                    {c.notes && <p className="mt-0.5 max-w-[260px] truncate text-[12px] text-white/40">{c.notes}</p>}
                  </td>
                  <td className="px-5 py-3.5 text-white/70">{c.company || "—"}</td>
                  <td className="px-5 py-3.5 text-[13px] text-white/70">
                    {c.email && <p>{c.email}</p>}
                    {c.phone && <p className="text-white/50">{c.phone}</p>}
                    {!c.email && !c.phone && "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/75">
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => openEdit(c)} className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] uppercase tracking-wider transition hover:bg-white hover:text-black">
                      Editar
                    </button>{" "}
                    <button onClick={() => archive(c.id)} className="rounded-lg px-3 py-1.5 text-[12px] uppercase tracking-wider text-white/45 transition hover:text-rose-300">
                      Arquivar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-white/40">
                    Nenhum contato aqui ainda. Clique em “Novo contato”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-white/5 md:hidden">
          {items.map((c) => (
            <div key={c.id} className="p-4 transition active:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-[12px] text-white/50">{[c.company, c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/75">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(c)} className="flex-1 rounded-xl border border-white/15 py-2 text-[12px] uppercase tracking-wider transition active:scale-95">
                  Editar
                </button>
                <button onClick={() => archive(c.id)} className="rounded-xl px-4 py-2 text-[12px] uppercase text-white/45">
                  Arquivar
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="p-8 text-center text-sm text-white/40">Nenhum contato ainda.</p>}
        </div>
      </div>

      {/* Modal cadastro/edição */}
      {modal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setModal(null)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg animate-[kbosUp_0.25s_ease] rounded-t-3xl border border-white/10 bg-[#12122a] p-6 sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">{"item" in modal ? "Editar contato" : "Novo contato"}</h2>
              <button type="button" onClick={() => setModal(null)} aria-label="Fechar" className="rounded-lg px-2 text-2xl leading-none text-white/60 hover:text-white">
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Nome *" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 sm:col-span-2" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" type="email" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefone / WhatsApp" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Empresa" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none">
                {CONTACT_STATUS.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#12122a]">{s.label}</option>
                ))}
              </select>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas (contexto, origem do lead...)" rows={3} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50 sm:col-span-2" />
            </div>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-white py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50">
              {saving ? "Salvando..." : "item" in modal ? "Salvar alterações" : "Cadastrar contato"}
            </button>
          </form>
          <style>{`@keyframes kbosUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
    </div>
  );
}
