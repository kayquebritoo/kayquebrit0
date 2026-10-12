"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CAMPAIGN_STATUS, CAMPAIGN_TARGETS } from "@/lib/kbos/constants";
import { TEMPLATE_VARS, renderTemplate } from "@/lib/kbos/campaigns";

type Campaign = {
  id: string;
  title: string;
  messageTemplate: string;
  status: string;
  targetStatus: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  createdAt: string;
};

type Log = {
  id: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactCompany: string | null;
};

const STATUS_LABEL: Record<string, string> = Object.fromEntries(CAMPAIGN_STATUS.map((s) => [s.id, s.label]));
const TARGET_LABEL: Record<string, string> = Object.fromEntries(CAMPAIGN_TARGETS.map((t) => [t.id, t.label]));
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-white/10 text-white/75",
  scheduled: "bg-amber-300/15 text-amber-200",
  running: "bg-sky-400/15 text-sky-200",
  completed: "bg-emerald-400/15 text-emerald-200",
  failed: "bg-rose-400/15 text-rose-200",
};

const SAMPLE = { name: "Maria Silva", company: "Padaria Pão Dourado", email: "maria@exemplo.com", phone: "+55 (11) 99999-8888" };
const emptyForm = { title: "", targetStatus: "all", messageTemplate: "Olá {{firstName}}! Aqui é da KBOS 👋", scheduledAt: "" };

function pct(c: Campaign): number {
  if (!c.totalRecipients) return 0;
  return Math.min(100, Math.round(((c.sentCount + c.failedCount) / c.totalRecipients) * 100));
}

export default function CampaignsBoard() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logFilter, setLogFilter] = useState("all");
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; item: Campaign }>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchAt, setDispatchAt] = useState("");
  const [dispatchInfo, setDispatchInfo] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  const loadLogs = useCallback(async (id: string) => {
    try {
      const p = new URLSearchParams();
      if (logFilter !== "all") p.set("status", logFilter);
      const res = await fetch(`/api/campaigns/${id}/logs?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha nos logs.");
      setLogs(data.items || []);
    } catch {
      /* mantém logs anteriores; a lista principal já sinaliza erro */
    }
  }, [logFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => items.find((c) => c.id === selectedId) ?? null, [items, selectedId]);

  // Progresso em tempo real enquanto há disparo ativo.
  useEffect(() => {
    if (!selectedId) return;
    loadLogs(selectedId);
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load();
      loadLogs(selectedId);
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, logFilter]);

  function openCreate() {
    setForm(emptyForm);
    setModal({ mode: "create" });
  }
  function openEdit(item: Campaign) {
    setForm({
      title: item.title,
      targetStatus: item.targetStatus,
      messageTemplate: item.messageTemplate,
      scheduledAt: item.scheduledAt ? item.scheduledAt.slice(0, 16) : "",
    });
    setModal({ mode: "edit", item });
  }

  function insertVar(v: string) {
    setForm((f) => ({ ...f, messageTemplate: `${f.messageTemplate}{{${v}}}` }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        targetStatus: form.targetStatus,
        messageTemplate: form.messageTemplate.trim(),
        scheduledAt: form.scheduledAt || undefined,
      };
      const isEdit = modal && "item" in modal;
      const res = await fetch(isEdit ? `/api/campaigns/${(modal as { item: Campaign }).item.id}` : "/api/campaigns", {
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

  async function dispatch() {
    if (!selected) return;
    if (!confirm(selected.status === "scheduled" && !dispatchAt ? "Disparar agora?" : "Iniciar disparo?")) return;
    setDispatching(true);
    setDispatchInfo("");
    try {
      const res = await fetch(`/api/campaigns/${selected.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dispatchAt ? { scheduledAt: new Date(dispatchAt).toISOString() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no disparo.");
      setDispatchInfo(
        data.scheduledFor
          ? `Agendada p/ ${new Date(data.scheduledFor).toLocaleString("pt-BR")} · ${data.targets} destinatários · ~${data.estimate}.`
          : `${data.targets} destinatários na fila · ~${data.estimate} · via ${data.via}.`
      );
      setDispatchAt("");
      load();
    } catch (e) {
      setDispatchInfo(e instanceof Error ? e.message : "Erro.");
    } finally {
      setDispatching(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta campanha e seus logs?")) return;
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Falha ao excluir.");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    load();
  }

  const preview = useMemo(() => renderTemplate(form.messageTemplate || "", SAMPLE), [form.messageTemplate]);
  const pending = selected ? Math.max(0, selected.totalRecipients - selected.sentCount - selected.failedCount) : 0;

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">
          {error.includes("DATABASE_URL") || error.includes("connect")
            ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push` (migration 0004_fase3_campaigns)."
            : error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">
          {items.length} campanha{items.length === 1 ? "" : "s"} · disparos com intervalo anti-banimento
        </p>
        <button onClick={openCreate} className="ml-auto rounded-xl bg-white px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-95">
          + Nova campanha
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Lista */}
        <div className="space-y-2">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full rounded-2xl border p-4 text-left transition-all duration-150 ${
                c.id === selectedId ? "border-white/40 bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug">{c.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${STATUS_STYLE[c.status] ?? STATUS_STYLE.draft}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-white/50">{TARGET_LABEL[c.targetStatus] ?? c.targetStatus}</p>
              {c.totalRecipients > 0 && (
                <div className="mt-2.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct(c)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] tabular-nums text-white/50">
                    {c.sentCount} enviadas · {c.failedCount} falhas · {c.totalRecipients} total
                  </p>
                </div>
              )}
            </button>
          ))}
          {items.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">Nenhuma campanha. Crie a primeira ↑</p>}
        </div>

        {/* Detalhe */}
        <div className="min-h-[300px] rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {!selected ? (
            <p className="pt-16 text-center text-sm text-white/40">Selecione uma campanha para ver métricas e disparar.</p>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">{selected.title}</h2>
                  <p className="mt-1 text-[12px] text-white/50">
                    {TARGET_LABEL[selected.targetStatus]} · criada em {new Date(selected.createdAt).toLocaleDateString("pt-BR")}
                    {selected.scheduledAt ? ` · agenda ${new Date(selected.scheduledAt).toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {(selected.status === "draft" || selected.status === "scheduled") && (
                    <button onClick={() => openEdit(selected)} className="rounded-xl border border-white/15 px-4 py-2 text-[12px] uppercase tracking-[0.12em] transition hover:bg-white/10">
                      Editar
                    </button>
                  )}
                  {selected.status !== "running" && (
                    <button onClick={() => remove(selected.id)} className="rounded-xl px-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/45 transition hover:text-rose-300">
                      Excluir
                    </button>
                  )}
                </div>
              </div>

              {/* Métricas + progresso */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Destinatários", value: String(selected.totalRecipients) },
                  { label: "Enviadas", value: String(selected.sentCount) },
                  { label: `Falhas${pending ? ` · ${pending} na fila` : ""}`, value: String(selected.failedCount) },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xl font-semibold tabular-nums">{m.value}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-white/45">{m.label}</p>
                  </div>
                ))}
              </div>
              {selected.totalRecipients > 0 && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-500" style={{ width: `${pct(selected)}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[11px] tabular-nums text-white/50">{pct(selected)}%</p>
                </div>
              )}

              {/* Template */}
              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-white/40">Mensagem</p>
              <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3.5 text-sm leading-relaxed">
                {renderTemplate(selected.messageTemplate, SAMPLE)}
              </p>

              {/* Disparo */}
              {(selected.status === "draft" || selected.status === "scheduled") && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Disparo via worker (Evolution, com pacing)</p>
                  <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="datetime-local"
                      value={dispatchAt}
                      onChange={(e) => setDispatchAt(e.target.value)}
                      aria-label="Agendar para (opcional)"
                      className="rounded-xl border border-white/15 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-white/50"
                    />
                    <button
                      onClick={dispatch}
                      disabled={dispatching}
                      className="flex-1 rounded-xl bg-white py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                    >
                      {dispatching ? "Enfileirando..." : dispatchAt ? "Agendar disparo" : "Disparar agora"}
                    </button>
                  </div>
                  {dispatchInfo && <p className="mt-2 text-[13px] text-emerald-200">{dispatchInfo}</p>}
                  <p className="mt-1.5 text-[12px] text-white/40">Sem data = imediato. A API só enfileira; o worker envia um a um.</p>
                </div>
              )}

              {/* Logs */}
              <div className="mt-5 flex items-center gap-1.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Entregas</p>
                <div className="ml-auto flex gap-1.5">
                  {["all", "sent", "failed", "pending"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setLogFilter(s)}
                      className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-wider transition ${logFilter === s ? "bg-white font-bold text-black" : "border border-white/15 text-white/55 hover:text-white"}`}
                    >
                      {s === "all" ? "Todas" : s === "sent" ? "Enviadas" : s === "failed" ? "Falhas" : "Na fila"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3.5 py-2.5 text-[13px]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${l.status === "sent" ? "bg-emerald-400" : l.status === "failed" ? "bg-rose-400" : "bg-amber-300"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.contactName || "—"}</span>
                      <span className="block truncate text-[12px] text-white/45">
                        {l.contactPhone || ""}
                        {l.errorMessage ? ` · ${l.errorMessage}` : ""}
                        {l.sentAt ? ` · ${new Date(l.sentAt).toLocaleTimeString("pt-BR")}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/40">{l.status}</span>
                  </div>
                ))}
                {logs.length === 0 && <p className="py-6 text-center text-[13px] text-white/35">Nada por aqui ainda.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      {modal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setModal(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl animate-[kbosUp_0.25s_ease] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#12122a] p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">{"item" in modal ? "Editar campanha" : "Nova campanha"}</h2>
              <button type="button" onClick={() => setModal(null)} aria-label="Fechar" className="rounded-lg px-2 text-2xl leading-none text-white/60 hover:text-white">×</button>
            </div>
            <div className="mt-4 grid gap-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Título (ex. Black Friday — base de leads)" className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50" />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                  Público (CRM)
                  <select value={form.targetStatus} onChange={(e) => setForm({ ...form, targetStatus: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm normal-case tracking-normal outline-none">
                    {CAMPAIGN_TARGETS.map((t) => (
                      <option key={t.id} value={t.id} className="bg-[#12122a]">{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                  Agendar p/ (opcional)
                  <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none" />
                </label>
              </div>
              <div>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {TEMPLATE_VARS.map((v) => (
                    <button key={v.id} type="button" onClick={() => insertVar(v.id)} title={`Exemplo: ${v.sample}`} className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 transition hover:border-white/40 hover:text-white active:scale-95">
                      {`{{${v.id}}}`}
                    </button>
                  ))}
                </div>
                <textarea value={form.messageTemplate} onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })} required rows={4} placeholder="Olá {{firstName}}! ..." className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm leading-relaxed outline-none placeholder:text-white/25 focus:border-white/50" />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Prévia (como a Maria recebe)</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{preview || "—"}</p>
              </div>
            </div>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-white py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-black transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50">
              {saving ? "Salvando..." : "item" in modal ? "Salvar alterações" : "Criar campanha"}
            </button>
          </form>
          <style>{`@keyframes kbosUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
    </div>
  );
}
