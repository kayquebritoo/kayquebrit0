"use client";
import { useCallback, useEffect, useState } from "react";

type Verdict = { ok: true } | { ok: false; reason: string };
type Case = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "awaiting" | "authorized" | "published" | "revoked";
  basis: "consent" | "contract" | "anonymous";
  service: "audiovisual" | "dev" | "branding";
  category: string | null;
  clientName: string | null;
  clientLogo: string | null;
  year: string | null;
  description: string | null;
  longDescription: string | null;
  about: string[] | null;
  img: string | null;
  gallery: string[] | null;
  videoLabel: string | null;
  videoId: string | null;
  siteUrl: string | null;
  metrics: string | null;
  testimonial: string | null;
  testimonialAuthor: string | null;
  contactId: string | null;
  needed: string[];
  consent: { status: string; grantedScopes: string[]; signerName: string | null; decidedAt: string | null } | null;
  pending: { expiresAt: string } | null;
  verdict: Verdict;
};
type Contact = { id: string; name: string; company: string | null };

const STATUS: Record<Case["status"], string> = {
  draft: "Rascunho",
  awaiting: "Aguardando cliente",
  authorized: "Autorizado",
  published: "No ar",
  revoked: "Revogado",
};
const ORDER: Case["status"][] = ["awaiting", "authorized", "draft", "published", "revoked"];
const FRONT: Record<Case["service"], string> = { audiovisual: "Imagem", branding: "Marca", dev: "Código" };

type Form = {
  id: string | null;
  title: string;
  service: Case["service"];
  basis: Case["basis"];
  clientName: string;
  clientLogo: string;
  year: string;
  category: string;
  description: string;
  longDescription: string;
  about: string;
  img: string;
  gallery: string;
  videoId: string;
  siteUrl: string;
  metrics: string;
  testimonial: string;
  testimonialAuthor: string;
  contactId: string;
};

const blank: Form = {
  id: null, title: "", service: "audiovisual", basis: "consent", clientName: "", clientLogo: "", year: String(new Date().getFullYear()),
  category: "", description: "", longDescription: "", about: "", img: "", gallery: "", videoId: "", siteUrl: "", metrics: "",
  testimonial: "", testimonialAuthor: "", contactId: "",
};

const toForm = (c: Case): Form => ({
  id: c.id, title: c.title, service: c.service, basis: c.basis, clientName: c.clientName ?? "", clientLogo: c.clientLogo ?? "",
  year: c.year ?? "", category: c.category ?? "", description: c.description ?? "", longDescription: c.longDescription ?? "",
  about: (c.about ?? []).join("\n\n"), img: c.img ?? "", gallery: (c.gallery ?? []).join("\n"), videoId: c.videoId ?? "",
  siteUrl: c.siteUrl ?? "", metrics: c.metrics ?? "", testimonial: c.testimonial ?? "", testimonialAuthor: c.testimonialAuthor ?? "",
  contactId: c.contactId ?? "",
});

export default function CasesBoard() {
  const [items, setItems] = useState<Case[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ title: string; url: string; waLink: string | null } | null>(null);
  const [note, setNote] = useState("");
  const [legacy, setLegacy] = useState<{ slug: string; title: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/cases/", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não deu para carregar os cases.");
      setItems(j.items);
      setLegacy(Array.isArray(j.legacy) ? j.legacy : []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setContacts(Array.isArray(j.items) ? j.items : []))
      .catch(() => {});
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function api(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Não consegui concluir.");
    return j;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError("");
    const payload = {
      title: form.title, service: form.service, basis: form.basis, clientName: form.clientName, clientLogo: form.clientLogo,
      year: form.year, category: form.category, description: form.description, longDescription: form.longDescription,
      about: form.about.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
      img: form.img, gallery: form.gallery.split("\n").map((s) => s.trim()).filter(Boolean),
      videoId: form.videoId, siteUrl: form.siteUrl, metrics: form.metrics, testimonial: form.testimonial,
      testimonialAuthor: form.testimonialAuthor, contactId: form.contactId || null,
    };
    try {
      const j = form.id ? await api(`/api/admin/cases/${form.id}/`, "PUT", payload) : await api("/api/admin/cases/", "POST", payload);
      setForm(null);
      setNote(j.resetToDraft ? "Mudou algo que o cliente já tinha autorizado: o case voltou para rascunho. Peça a autorização de novo." : "Case salvo.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(c: Case) {
    setBusy(true);
    setNote("");
    try {
      const j = await api(`/api/admin/cases/${c.id}/consent/`, "POST");
      setLink({ title: c.title, url: j.url, waLink: j.waLink });
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Não consegui gerar o link.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(c: Case, on: boolean) {
    setBusy(true);
    setNote("");
    try {
      await api(`/api/admin/cases/${c.id}/publish/`, "POST", { publish: on });
      setNote(on ? `${c.title} está no ar.` : `${c.title} saiu do ar.`);
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Não consegui publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function importLegacy() {
    setBusy(true);
    setNote("");
    try {
      const j = await api("/api/admin/cases/import/", "POST");
      setNote(j.imported?.length ? `${j.imported.length} case(s) do site agora estão aqui, no ar do mesmo jeito.` : "Nada novo para trazer.");
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Não consegui importar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    setBusy(true);
    try {
      await api(`/api/admin/cases/${form.id}/`, "DELETE");
      setForm(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não consegui apagar.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !items) {
    return (
      <div className="kb-glass p-6">
        <p className="font-semibold">Não deu para carregar os cases.</p>
        <p className="kb-muted mt-1 text-sm">{error}</p>
        <button type="button" onClick={load} className="kb-chip mt-4">Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="kb-stagger flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="kb-muted max-w-xl text-sm leading-relaxed">
          Um case só vai ao ar com a autorização do cliente. Os cases antigos do site continuam no ar (cobertos pelo contrato) até você criar aqui um com o mesmo endereço.
        </p>
        <button type="button" className="kb-btn shrink-0" onClick={() => { setFormError(""); setForm({ ...blank }); }}>+ Novo case</button>
      </div>
      {note && <p role="status" className="kb-tag self-start">{note}</p>}
      {legacy.length > 0 && (
        <div className="kb-glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed">
            <strong>{legacy.length} case(s) do site</strong> ainda não estão no painel: {legacy.map((l) => l.title).join(", ")}. Importar não muda nada no ar; só passa a dar para editar e gerenciar aqui.
          </p>
          <button type="button" className="kb-btn min-h-11 shrink-0" disabled={busy} onClick={importLegacy}>Importar do site</button>
        </div>
      )}

      {!items ? (
        <div className="flex flex-col gap-3">{[0, 1].map((i) => <div key={i} className="kb-skel h-28" />)}</div>
      ) : items.length === 0 ? (
        <div className="kb-glass p-6 text-sm kb-muted">Nenhum case aqui ainda. Toque em &quot;Novo case&quot;, preencha e peça a autorização ao cliente.</div>
      ) : (
        ORDER.map((st) => {
          const list = items.filter((c) => c.status === st);
          if (!list.length) return null;
          return (
            <section key={st} aria-label={STATUS[st]} className="flex flex-col gap-2.5">
              <h2 className="px-1 text-base font-semibold">{STATUS[st]} <span className="kb-faint text-xs font-normal">{list.length}</span></h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((c) => (
                  <article key={c.id} className="kb-card">
                    <button type="button" className="text-left" onClick={() => { setFormError(""); setForm(toForm(c)); }} aria-label={`Editar ${c.title}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">{c.title}</span>
                        <span className="kb-tag">{FRONT[c.service]}</span>
                      </span>
                      <span className="kb-muted block text-sm">{c.clientName || "Sem cliente"} · {c.year || "—"}</span>
                    </button>
                    <p className="kb-faint text-xs">
                      {c.basis === "consent" ? "Base: autorização do cliente" : c.basis === "contract" ? "Base: contrato" : "Anônimo"}
                      {c.consent?.status === "granted" && c.consent.signerName ? ` · ${c.consent.signerName} autorizou` : ""}
                      {c.consent?.status === "revoked" ? " · cliente revogou" : ""}
                      {c.pending ? " · link enviado" : ""}
                    </p>
                    {!c.verdict.ok && c.status !== "published" && <p className="text-xs text-[var(--kb-late)]">{c.verdict.reason}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.basis === "consent" && c.status !== "published" && (
                        <button type="button" className="kb-chip" disabled={busy} onClick={() => ask(c)}>{c.pending ? "Gerar novo link" : "Pedir autorização"}</button>
                      )}
                      {c.status !== "published" && c.verdict.ok && (
                        <button type="button" className="kb-btn" disabled={busy} onClick={() => publish(c, true)}>Publicar</button>
                      )}
                      {c.status === "published" && (
                        <>
                          <a className="kb-chip" href={`/trabalho/${c.slug}/`} target="_blank" rel="noreferrer">Ver no site</a>
                          <button type="button" className="kb-chip" disabled={busy} onClick={() => publish(c, false)}>Tirar do ar</button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}

      {link && (
        <div className="kb-modal-back" onClick={() => setLink(null)}>
          <div className="kb-modal space-y-4" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Link de autorização">
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">Link para o cliente</h2>
              <button type="button" onClick={() => setLink(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>
            <p className="kb-muted text-sm">O cliente vê a prévia de &quot;{link.title}&quot;, marca o que libera e confirma com o nome. Vale 14 dias; um link novo cancela o anterior.</p>
            <label className="kb-field"><span>Link</span><input className="kb-control" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} /></label>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="kb-btn" onClick={async () => { try { await navigator.clipboard.writeText(link.url); setNote("Link copiado."); } catch { setNote("Selecione e copie o link."); } }}>Copiar link</button>
              {link.waLink && <a className="kb-chip" href={link.waLink} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>}
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="kb-modal-back" onClick={() => setForm(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" aria-label="Editar case">
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">{form.id ? "Editar case" : "Novo case"}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>

            <label className="kb-field"><span>Título</span><input className="kb-control" value={form.title} onChange={(e) => set("title", e.target.value)} required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field"><span>Frente</span>
                <select className="kb-control" value={form.service} onChange={(e) => set("service", e.target.value as Form["service"])}>
                  <option value="audiovisual">Imagem</option><option value="branding">Marca</option><option value="dev">Código</option>
                </select>
              </label>
              <label className="kb-field"><span>Ano</span><input className="kb-control" value={form.year} onChange={(e) => set("year", e.target.value)} inputMode="numeric" /></label>
            </div>
            <label className="kb-field"><span>Base para publicar</span>
              <select className="kb-control" value={form.basis} onChange={(e) => set("basis", e.target.value as Form["basis"])}>
                <option value="consent">Autorização do cliente (recomendado)</option>
                <option value="contract">Contrato (sem números nem depoimento)</option>
                <option value="anonymous">Anônimo (sem nome, logo, números e depoimento)</option>
              </select>
            </label>
            <label className="kb-field"><span>Cliente do CRM (para enviar o pedido)</span>
              <select className="kb-control" value={form.contactId} onChange={(e) => { set("contactId", e.target.value); const c = contacts.find((x) => x.id === e.target.value); if (c && !form.clientName) set("clientName", c.company || c.name); }}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.company ? `${c.name} · ${c.company}` : c.name}</option>)}
              </select>
            </label>
            <label className="kb-field"><span>Nome de exibição do cliente</span><input className="kb-control" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} /></label>
            <label className="kb-field"><span>Descrição curta</span><input className="kb-control" value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
            <label className="kb-field"><span>Sobre o projeto (parágrafos separados por linha em branco)</span><textarea className="kb-control" rows={5} value={form.about} onChange={(e) => set("about", e.target.value)} /></label>
            <label className="kb-field"><span>Capa (link https ou /assets/…)</span><input className="kb-control" value={form.img} onChange={(e) => set("img", e.target.value)} inputMode="url" /></label>
            <label className="kb-field"><span>Galeria (um link por linha)</span><textarea className="kb-control" rows={3} value={form.gallery} onChange={(e) => set("gallery", e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="kb-field"><span>ID do vídeo no YouTube</span><input className="kb-control" value={form.videoId} onChange={(e) => set("videoId", e.target.value)} /></label>
              <label className="kb-field"><span>Site no ar</span><input className="kb-control" value={form.siteUrl} onChange={(e) => set("siteUrl", e.target.value)} inputMode="url" /></label>
            </div>
            <label className="kb-field"><span>Logo do cliente (link)</span><input className="kb-control" value={form.clientLogo} onChange={(e) => set("clientLogo", e.target.value)} inputMode="url" /></label>
            <label className="kb-field"><span>Resultado em números (só com autorização)</span><input className="kb-control" value={form.metrics} onChange={(e) => set("metrics", e.target.value)} /></label>
            <label className="kb-field"><span>Depoimento (só com autorização)</span><textarea className="kb-control" rows={3} value={form.testimonial} onChange={(e) => set("testimonial", e.target.value)} /></label>
            <label className="kb-field"><span>Quem deu o depoimento</span><input className="kb-control" value={form.testimonialAuthor} onChange={(e) => set("testimonialAuthor", e.target.value)} /></label>

            {formError && <p role="alert" className="text-sm text-[var(--kb-late)]">{formError}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="submit" className="kb-btn flex-1" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
              {form.id && <button type="button" className="kb-btn-ghost" onClick={remove} disabled={busy}>Apagar</button>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
