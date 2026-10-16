"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { REMINDER_OPTIONS, reminderLabel } from "@/lib/kbos/agenda";

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  location: string | null;
  reminderMinutesBefore: number;
  notificationSent: boolean;
  reminderSentAt: string | null;
};

const emptyForm = { title: "", description: "", start: "", end: "", location: "", reminder: "15" };
const input =
  "rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50";

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tag =
    d.toDateString() === today.toDateString()
      ? "Hoje"
      : d.toDateString() === tomorrow.toDateString()
        ? "Amanhã"
        : d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${tag} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function AgendaBoard() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // Relógio da tela (render puro): reclassifica próximos/passados a cada minuto.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
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
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const up = items.filter((e) => new Date(e.startTime).getTime() >= now - 60_000);
    const pa = items.filter((e) => new Date(e.startTime).getTime() < now - 60_000).reverse();
    return { upcoming: up, past: pa };
  }, [items, now]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          startTime: new Date(form.start).toISOString(),
          endTime: form.end ? new Date(form.end).toISOString() : undefined,
          location: form.location.trim() || undefined,
          reminderMinutesBefore: Number(form.reminder),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha.");
      setForm(emptyForm);
      setModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function resend(id: string) {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markUnsent: true }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este compromisso?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    load();
  }

  function card(e: EventItem) {
    return (
      <div key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{e.title}</p>
            <p className="mt-0.5 text-[13px] tabular-nums text-white/60">{fmtDay(e.startTime)}</p>
            {e.location && <p className="mt-0.5 truncate text-[12px] text-white/45">📍 {e.location}</p>}
            {e.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/55">{e.description}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            {!e.notificationSent && (
              <button onClick={() => resend(e.id)} title="Reavisar (rearma o alerta)" className="rounded-lg px-2 py-1 text-white/40 transition hover:text-white">
                ↻
              </button>
            )}
            <button onClick={() => remove(e.id)} aria-label="Excluir" className="rounded-lg px-2 py-1 text-white/35 transition hover:text-rose-300">
              ×
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.1em] ${
              e.reminderMinutesBefore > 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/45"
            }`}
          >
            {e.reminderMinutesBefore > 0 ? `✆ ${reminderLabel(e.reminderMinutesBefore)}` : reminderLabel(0)}
          </span>
          {e.notificationSent && (
            <span className="text-[11px] text-white/40">
              ✓ avisado{e.reminderSentAt ? ` ${new Date(e.reminderSentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          )}
          {!e.notificationSent && e.reminderMinutesBefore > 0 && new Date(e.startTime).getTime() > now && (
            <span className="text-[11px] text-amber-200/80">○ alerta pendente</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">
          {error.includes("DATABASE_URL") || error.includes("connect")
            ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push` (migration 0005_fase4_finance_agenda)."
            : error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">
          {upcoming.length} próximo{upcoming.length === 1 ? "" : "s"} · alertas via WhatsApp no automático
        </p>
        <button onClick={() => setModal(true)} className="ml-auto rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:opacity-90 active:scale-95">
          + Compromisso
        </button>
      </div>

      <p className="mb-2 mt-6 text-[11px] uppercase tracking-[0.25em] text-white/40">Próximos</p>
      <div className="grid gap-3 md:grid-cols-2">
        {upcoming.map(card)}
        {upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40 md:col-span-2">
            Agenda livre. Que tal lançar o próximo compromisso?
          </p>
        )}
      </div>

      {past.length > 0 && (
        <>
          <p className="mb-2 mt-8 text-[11px] uppercase tracking-[0.25em] text-white/40">Passados</p>
          <div className="grid gap-3 opacity-70 md:grid-cols-2">{past.slice(0, 10).map(card)}</div>
        </>
      )}

      {modal && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setModal(false)}>
          <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-[kbosUp_0.25s_ease] rounded-t-3xl border border-white/10 bg-[#1a1828] p-6 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Novo compromisso</h2>
              <button type="button" onClick={() => setModal(false)} aria-label="Fechar" className="rounded-lg px-2 text-2xl leading-none text-white/60 hover:text-white">×</button>
            </div>
            <div className="mt-4 grid gap-3">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Título (ex. Reunião — Padaria Pão Dourado)" className={input} />
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                  Início *
                  <input type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={input} />
                </label>
                <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                  Término
                  <input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={input} />
                </label>
              </div>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Local (ex. Meet, escritório...)" className={input} />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Descrição (opcional)" className={input} />
              <label className="grid gap-1 text-[12px] uppercase tracking-[0.15em] text-white/45">
                Alerta WhatsApp
                <select value={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.value })} className={input}>
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-[#1a1828]">{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={saving} className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag py-3 text-[12px] font-bold uppercase tracking-[0.15em] text-white transition hover:opacity-90 disabled:opacity-50">
              {saving ? "Salvando..." : "Agendar"}
            </button>
          </form>
          <style>{`@keyframes kbosUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}`}</style>
        </div>
      )}
    </div>
  );
}
