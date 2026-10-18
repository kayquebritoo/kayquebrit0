"use client";
import { useCallback, useEffect, useState } from "react";

type Svc = {
  slug: string;
  front: "imagem" | "marca" | "codigo";
  label: string;
  tagline: string;
  description: string;
  priceFrom: number;
  term: string;
  includes: string[];
  pitch: string[];
  process: { title: string; desc: string }[];
  active: boolean;
  custom: boolean;
};

type Form = {
  slug: string;
  label: string;
  tagline: string;
  description: string;
  price: string;
  term: string;
  includes: string;
  pitch: string;
  steps: { title: string; desc: string }[];
  active: boolean;
  custom: boolean;
};

const FRONTS: { id: Svc["front"]; label: string; hint: string }[] = [
  { id: "imagem", label: "Imagem", hint: "Foto e vídeo" },
  { id: "marca", label: "Marca", hint: "Design e identidade" },
  { id: "codigo", label: "Código", hint: "Sites, lojas e sistemas" },
];

const money = (n: number) => `R$ ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const toForm = (s: Svc): Form => ({
  slug: s.slug,
  label: s.label,
  tagline: s.tagline,
  description: s.description,
  price: String(s.priceFrom),
  term: s.term,
  includes: s.includes.join("\n"),
  pitch: s.pitch.join("\n\n"),
  steps: Array.from({ length: 3 }, (_, i) => s.process[i] ?? { title: "", desc: "" }),
  active: s.active,
  custom: s.custom,
});

export default function ServicesBoard() {
  const [items, setItems] = useState<Svc[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/services/", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não deu para carregar os serviços.");
      setItems(j.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError("");
    const includes = form.includes.split("\n").map((l) => l.trim()).filter(Boolean);
    const pitch = form.pitch.split(/\n\s*\n/).map((l) => l.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    const process = form.steps.map((s) => ({ title: s.title.trim(), desc: s.desc.trim() })).filter((s) => s.title && s.desc);
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/services/${form.slug}/`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim() || null,
          tagline: form.tagline.trim() || null,
          description: form.description.trim() || null,
          priceFrom: form.price.trim() ? form.price.trim() : null,
          term: form.term.trim(),
          includes,
          pitch,
          process,
          active: form.active,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
      setSaved(form.label);
      setForm(null);
      await load();
      setTimeout(() => setSaved(""), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!form) return;
    setSaving(true);
    setFormError("");
    try {
      const r = await fetch(`/api/admin/services/${form.slug}/`, { method: "DELETE" });
      if (!r.ok) throw new Error("Não consegui restaurar.");
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não consegui restaurar.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !items) {
    return (
      <div className="kb-glass p-6">
        <p className="font-semibold">Não deu para carregar os serviços.</p>
        <p className="kb-muted mt-1 text-sm">{error}</p>
        <button type="button" onClick={load} className="kb-chip mt-4">Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="kb-stagger flex flex-col gap-5">
      <p className="kb-muted text-sm leading-relaxed">
        O que você muda aqui vale para o site (páginas de serviço e orçamento) e para o seletor de serviços dos orçamentos do KBOS.
        Prazo vazio não aparece em lugar nenhum.
      </p>
      {saved && (
        <p role="status" className="kb-arrive kb-tag self-start">
          {saved} atualizado no site e no KBOS
        </p>
      )}

      {!items ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="kb-skel h-24" />
          ))}
        </div>
      ) : (
        FRONTS.map((f) => {
          const list = items.filter((s) => s.front === f.id);
          if (!list.length) return null;
          return (
            <section key={f.id} aria-label={f.label} className="flex flex-col gap-2.5">
              <h2 className="flex items-baseline gap-2 px-1 text-base font-semibold">
                {f.label}
                <span className="kb-faint text-xs font-normal">{f.hint}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((s) => (
                  <button key={s.slug} type="button" onClick={() => { setFormError(""); setForm(toForm(s)); }} className="kb-card text-left" aria-label={`Editar ${s.label}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold">{s.label}</span>
                      <span className="flex items-center gap-1.5">
                        {!s.active && <span className="kb-tag late">Oculto</span>}
                        {s.custom && <span className="kb-tag">Editado</span>}
                      </span>
                    </span>
                    <span className="kb-muted text-sm leading-snug">{s.tagline}</span>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                      <span className="font-semibold">a partir de {money(s.priceFrom)}</span>
                      <span className={s.term ? "kb-muted" : "kb-faint"}>{s.term ? `Prazo: ${s.term}` : "Prazo não definido"}</span>
                      <span className="kb-faint">{s.includes.length} itens inclusos</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })
      )}

      {form && (
        <div className="kb-modal-back" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" aria-label={`Editar ${form.label}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">{form.label || "Serviço"}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field">
                <span>Valor a partir de (R$)</span>
                <input className="kb-control" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="1500" />
              </label>
              <label className="kb-field">
                <span>Prazo típico</span>
                <input className="kb-control" value={form.term} onChange={(e) => set("term", e.target.value)} placeholder="Ex.: 7 a 15 dias úteis" />
              </label>
            </div>

            <label className="kb-field">
              <span>O que está incluso (um item por linha)</span>
              <textarea className="kb-control" rows={5} value={form.includes} onChange={(e) => set("includes", e.target.value)} />
            </label>

            <label className="kb-field">
              <span>Nome do serviço</span>
              <input className="kb-control" value={form.label} onChange={(e) => set("label", e.target.value)} required />
            </label>
            <label className="kb-field">
              <span>Frase de destaque</span>
              <input className="kb-control" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} />
            </label>
            <label className="kb-field">
              <span>Descrição curta</span>
              <input className="kb-control" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </label>
            <label className="kb-field">
              <span>Texto de venda (separe parágrafos com uma linha em branco)</span>
              <textarea className="kb-control" rows={6} value={form.pitch} onChange={(e) => set("pitch", e.target.value)} />
            </label>

            <fieldset className="space-y-2">
              <legend className="kb-muted mb-1 text-xs">Etapas do processo (até 3)</legend>
              {form.steps.map((s, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr] gap-2">
                  <input
                    className="kb-control"
                    aria-label={`Etapa ${i + 1}, título`}
                    value={s.title}
                    onChange={(e) => set("steps", form.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    placeholder="Título"
                  />
                  <input
                    className="kb-control"
                    aria-label={`Etapa ${i + 1}, descrição`}
                    value={s.desc}
                    onChange={(e) => set("steps", form.steps.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))}
                    placeholder="O que acontece"
                  />
                </div>
              ))}
            </fieldset>

            <div className="kb-seg" role="group" aria-label="Aparece no site">
              <button type="button" aria-pressed={form.active} onClick={() => set("active", true)}>Visível no site</button>
              <button type="button" data-tone="out" aria-pressed={!form.active} onClick={() => set("active", false)}>Oculto</button>
            </div>

            {formError && <p role="alert" className="text-sm text-[var(--kb-late)]">{formError}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="submit" className="kb-btn flex-1" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
              {form.custom && (
                <button type="button" className="kb-btn-ghost" onClick={reset} disabled={saving}>Voltar ao padrão</button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
