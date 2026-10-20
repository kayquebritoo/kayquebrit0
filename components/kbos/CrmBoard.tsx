"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTACT_STATUS } from "@/lib/kbos/constants";
import Client360 from "./Client360";
import ImportContacts from "./ImportContacts";
import { duplicateGroups } from "@/lib/kbos/contact-dupes";
import { cleanDocument, isValidCNPJ, maskDocumentInput } from "@/lib/kbos/document";

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  notes: string | null;
  kind: "pf" | "pj" | null;
  document: string | null;
  legalName: string | null;
  stateRegistration: string | null;
  role: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  website: string | null;
  instagram: string | null;
  facebook?: string | null;
  photoUrl?: string | null;
  source: string | null;
  updatedAt?: string;
};

type Form = {
  kind: "pf" | "pj";
  name: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  notes: string;
  document: string;
  legalName: string;
  stateRegistration: string;
  role: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  website: string;
  instagram: string;
};

const STATUS_LABEL: Record<string, string> = Object.fromEntries(CONTACT_STATUS.map((s) => [s.id, s.label]));
const FILTERS = [{ id: "all", label: "Todos" }, ...CONTACT_STATUS];
const TEXT_KEYS = ["email", "phone", "company", "notes", "document", "legalName", "stateRegistration", "role", "address", "city", "state", "zipCode", "website", "instagram"] as const;

const emptyForm: Form = {
  kind: "pj",
  name: "",
  email: "",
  phone: "",
  company: "",
  status: "lead",
  notes: "",
  document: "",
  legalName: "",
  stateRegistration: "",
  role: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  website: "",
  instagram: "",
};

/** Cadastro completo? (o que um contrato pede: nome, documento, contato e endereço) */
function missing(c: Contact): string[] {
  const out: string[] = [];
  if (!c.document) out.push(c.kind === "pf" ? "CPF" : "CNPJ");
  if (!c.email) out.push("e-mail");
  if (!c.phone) out.push("telefone");
  if (!c.city) out.push("endereço");
  return out;
}

export default function CrmBoard() {
  const [items, setItems] = useState<Contact[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [gSession, setGSession] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeMsg, setMergeMsg] = useState("");
  const [lookup, setLookup] = useState<"idle" | "busy" | "ok" | string>("idle");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "3000" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setItems(data.items || []);
      setError("");
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.filter((i) => i.status !== "archived").length };
    for (const s of CONTACT_STATUS) c[s.id] = items.filter((i) => i.status === s.id).length;
    return c;
  }, [items]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const imp = sp.get("importar");
    if (!imp) return;
    /* eslint-disable react-hooks/set-state-in-effect -- abre o importador uma vez, vindo do retorno do Google. */
    if (imp === "google" && sp.get("sessao")) setGSession(sp.get("sessao"));
    if (imp === "erro") setImportErr({ "google-config": "O Google ainda não está configurado para importar contatos (falta liberar no Google Cloud).", negado: "Você não autorizou o acesso aos contatos.", estado: "A conexão com o Google expirou. Tente de novo.", token: "O Google recusou a conexão. Tente de novo." }[sp.get("motivo") || ""] || "Não consegui buscar os contatos do Google.");
    setImportOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const dupes = useMemo(() => duplicateGroups(items.map((c) => ({ ...c, createdAt: c.updatedAt ?? null }))), [items]);

  async function mergeGroup(group: Contact[]) {
    const [keep, ...rest] = group;
    if (!confirm(`Juntar ${rest.length} contato(s) repetido(s) em "${keep.name}"? Projetos, cobranças, conversas e orçamentos vão para ele; os outros ficam arquivados.`)) return;
    setMerging(true);
    setMergeMsg("");
    try {
      for (const r of rest) {
        const res = await fetch("/api/admin/contacts/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId: keep.id, removeId: r.id }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Não consegui juntar.");
      }
      setMergeMsg(`Pronto: ${rest.length} contato(s) juntado(s) em ${keep.name}.`);
      await load();
    } catch (e) {
      setMergeMsg(e instanceof Error ? e.message : "Erro.");
    } finally {
      setMerging(false);
    }
  }

  async function mergeAll() {
    const extra = dupes.reduce((a, g) => a + g.length - 1, 0);
    if (!confirm(`Combinar ${extra} contato(s) repetido(s) em ${dupes.length} pessoa(s)? Em cada grupo fica o mais completo; os outros são arquivados e tudo deles (projetos, cobranças, conversas, orçamentos) vai para ele.`)) return;
    setMerging(true);
    setMergeMsg("");
    let done = 0;
    try {
      for (const g of dupes) {
        const [keep, ...rest] = g;
        for (const r of rest) {
          const res = await fetch("/api/admin/contacts/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId: keep.id, removeId: r.id }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Não consegui juntar.");
          done++;
        }
      }
      setMergeMsg(`Pronto: ${done} contato(s) combinado(s).`);
    } catch (e) {
      setMergeMsg(`${e instanceof Error ? e.message : "Erro."} (${done} já combinado(s).)`);
    } finally {
      await load();
      setMerging(false);
    }
  }

  const shown = useMemo(
    () => items.filter((c) => (filter === "all" ? c.status !== "archived" : c.status === filter)),
    [items, filter]
  );

  function openCreate() {
    setForm(emptyForm);
    setFormError("");
    setLookup("idle");
    setEditing("new");
  }

  function openEdit(c: Contact) {
    const f: Form = { ...emptyForm, kind: c.kind === "pf" ? "pf" : c.document && cleanDocument(c.document).length === 11 ? "pf" : "pj", name: c.name, status: c.status };
    for (const k of TEXT_KEYS) f[k] = (c[k] as string | null) ?? "";
    setForm(f);
    setFormError("");
    setLookup("idle");
    setEditing(c);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function fillFromCnpj(doc: string) {
    setLookup("busy");
    try {
      const res = await fetch(`/api/contacts/cnpj?doc=${encodeURIComponent(cleanDocument(doc))}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Não achei esse CNPJ.");
      setForm((f) => ({
        ...f,
        legalName: d.legalName || f.legalName,
        company: f.company || d.company || "",
        name: f.name || d.company || d.legalName || "",
        address: d.address || f.address,
        city: d.city || f.city,
        state: d.state || f.state,
        zipCode: d.zipCode || f.zipCode,
        phone: f.phone || d.phone || "",
        email: f.email || d.email || "",
      }));
      setLookup(d.situation && d.situation !== "ATIVA" ? `Atenção: situação na Receita "${d.situation}".` : "ok");
    } catch (e) {
      setLookup(e instanceof Error ? e.message : "Falhou.");
    }
  }

  function onDocument(v: string) {
    const masked = maskDocumentInput(v);
    set("document", masked);
    const clean = cleanDocument(masked);
    if (form.kind === "pj" && clean.length === 14 && isValidCNPJ(clean)) void fillFromCnpj(clean);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const isEdit = editing && editing !== "new";
      const payload: Record<string, unknown> = { name: form.name.trim(), status: form.status, kind: form.kind };
      for (const k of TEXT_KEYS) {
        const v = form[k].trim();
        payload[k] = v ? (k === "state" ? v.toUpperCase().slice(0, 2) : v) : isEdit ? null : undefined;
      }
      const res = await fetch(isEdit ? `/api/contacts/${(editing as Contact).id}` : "/api/contacts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details?.[0]?.mensagem || data.error || "Falha ao salvar.");
      setEditing(null);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!editing || editing === "new" || !confirm("Arquivar este contato?")) return;
    await fetch(`/api/contacts/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    load();
  }

  const isPJ = form.kind === "pj";

  return (
    <div className="space-y-4">
      {error && <div className="kb-tag late w-full justify-start rounded-2xl! px-4! py-3! text-sm">{error}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="kb-glass flex min-w-0 flex-1 items-center gap-2 rounded-2xl! px-4">
          <span aria-hidden className="kb-faint">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nome, empresa, CNPJ, telefone…"
            className="kb-input"
            aria-label="Buscar contatos"
          />
        </label>
        <button type="button" onClick={() => setDupesOpen(true)} className="kb-btn-ghost min-h-11">
          Combinar iguais{dupes.length > 0 ? ` (${dupes.reduce((a, g) => a + g.length - 1, 0)})` : ""}
        </button>
        <button type="button" onClick={() => setImportOpen(true)} className="kb-btn-ghost min-h-11">Importar</button>
        <button type="button" onClick={openCreate} className="kb-btn">
          + Novo contato
        </button>
      </div>

      <div className="kb-scroll-x -mx-4 scroll-px-4 px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="kb-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="kb-faint tabular-nums">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {dupes.length > 0 && (
        <button type="button" onClick={() => setDupesOpen(true)} className="kb-glass flex w-full items-center justify-between gap-3 rounded-2xl! px-4 py-3 text-left">
          <span className="text-sm">
            <b className="kb-ink">{dupes.reduce((a, g) => a + g.length - 1, 0)} contato(s) repetido(s)</b>
            <span className="kb-muted block text-[12px]">Mesmo telefone, e-mail ou @ em mais de um cadastro. Toque para juntar.</span>
          </span>
          <span className="kb-tag soon shrink-0">Revisar</span>
        </button>
      )}

      <section className="kb-glass px-4 py-1">
        {shown.map((c) => {
          const gaps = missing(c);
          return (
            <button key={c.id} type="button" onClick={() => setFichaId(c.id)} className="kb-row w-full text-left first:border-t-0">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="relative h-10 w-10 shrink-0">
                  <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--kb-accent-soft)] text-sm font-semibold uppercase">
                    {c.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1) || "?"}
                  </span>
                  {c.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/contacts/${c.id}/avatar`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="absolute inset-0 h-10 w-10 rounded-full object-cover" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="kb-ink block truncate text-[15px]">
                    {c.name}
                    {c.company && c.company !== c.name ? <span className="kb-muted"> · {c.company}</span> : null}
                  </span>
                  <span className="kb-faint block truncate text-[12px]">
                    {[c.document, c.phone, c.email, c.city && `${c.city}${c.state ? `/${c.state}` : ""}`].filter(Boolean).join(" · ") || "Sem dados de contato"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="kb-tag">{STATUS_LABEL[c.status] ?? c.status}</span>
                {c.status === "client" && gaps.length > 0 && (
                  <span className="kb-tag soon" title={`Falta: ${gaps.join(", ")}`}>
                    Falta {gaps[0]}
                    {gaps.length > 1 ? ` +${gaps.length - 1}` : ""}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {!loaded && !error && (
          <div className="space-y-3 py-4" aria-busy="true" aria-label="Carregando contatos">
            {[0, 1, 2, 3].map((i) => <span key={i} className="kb-skel h-12 w-full" />)}
          </div>
        )}
        {loaded && shown.length === 0 && <p className="kb-muted py-10 text-center text-sm">Ninguém aqui ainda.</p>}
      </section>

      {dupesOpen && (
        <div className="kb-modal-back" onClick={() => setDupesOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" role="dialog" aria-label="Contatos repetidos">
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">Contatos repetidos</h2>
              <button type="button" onClick={() => setDupesOpen(false)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>
            <p className="kb-muted text-sm">O primeiro de cada grupo (o mais completo) é o que fica. Os outros são arquivados e tudo deles vai para ele.</p>
            {mergeMsg && <p role="status" className="kb-tag w-full justify-start rounded-xl! px-3! py-2! text-sm">{mergeMsg}</p>}
            {dupes.length === 0 && <p className="kb-muted py-6 text-center text-sm">Nada repetido. Tudo certo.</p>}
            {dupes.length > 1 && (
              <button type="button" disabled={merging} onClick={mergeAll} className="kb-btn w-full">
                {merging ? "Combinando…" : `Combinar todos (${dupes.length} grupos)`}
              </button>
            )}
            {dupes.map((g) => (
              <div key={g[0].id} className="kb-glass space-y-2 rounded-2xl! p-4">
                {g.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="kb-ink min-w-0 truncate">{c.name}</span>
                    <span className={`kb-tag shrink-0 ${i === 0 ? "" : "soon"}`}>{i === 0 ? "Fica" : "Junta"}</span>
                  </div>
                ))}
                <button type="button" disabled={merging} onClick={() => mergeGroup(g)} className="kb-btn w-full">
                  {merging ? "Juntando…" : `Juntar ${g.length} em 1`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {importOpen && (
        <ImportContacts
          googleSession={gSession}
          startError={importErr}
          onClose={() => { setImportOpen(false); setGSession(null); setImportErr(null); }}
          onDone={() => { load(); }}
        />
      )}

      {fichaId && (
        <Client360
          id={fichaId}
          onClose={() => setFichaId(null)}
          onEdit={() => {
            const c = items.find((i) => i.id === fichaId);
            setFichaId(null);
            if (c) openEdit(c);
          }}
        />
      )}

      {editing && (
        <div className="kb-modal-back" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="kb-modal space-y-4" aria-label="Cadastro do contato">
            <div className="flex items-center justify-between">
              <h2 className="font-display kb-ink text-xl">{editing === "new" ? "Novo contato" : "Cadastro"}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Fechar" className="kb-muted -mr-2 h-11 w-11 text-2xl">×</button>
            </div>

            <div className="kb-seg" role="group" aria-label="Tipo de pessoa">
              <button type="button" aria-pressed={isPJ} onClick={() => set("kind", "pj")}>Empresa (CNPJ)</button>
              <button type="button" aria-pressed={!isPJ} onClick={() => set("kind", "pf")}>Pessoa (CPF)</button>
            </div>

            <label className="kb-field">
              <span>{isPJ ? "CNPJ — preenche o resto sozinho" : "CPF"}</span>
              <input
                className="kb-control tabular-nums"
                value={form.document}
                onChange={(e) => onDocument(e.target.value)}
                placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
                inputMode={isPJ ? "text" : "numeric"}
                autoCapitalize="characters"
              />
              {lookup !== "idle" && (
                <span className={lookup === "ok" ? "text-[var(--kb-good)]!" : lookup === "busy" ? "" : "text-[var(--kb-soon)]!"}>
                  {lookup === "busy" ? "Consultando a Receita…" : lookup === "ok" ? "✓ Dados da Receita preenchidos" : lookup}
                </span>
              )}
            </label>

            {isPJ && (
              <label className="kb-field">
                <span>Razão social</span>
                <input className="kb-control" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Como está no CNPJ" />
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="kb-field">
                <span>{isPJ ? "Nome de quem fala com você" : "Nome completo"}</span>
                <input className="kb-control" value={form.name} onChange={(e) => set("name", e.target.value)} required autoComplete="off" />
              </label>
              {isPJ ? (
                <label className="kb-field">
                  <span>Nome fantasia / marca</span>
                  <input className="kb-control" value={form.company} onChange={(e) => set("company", e.target.value)} />
                </label>
              ) : (
                <label className="kb-field">
                  <span>Empresa (se tiver)</span>
                  <input className="kb-control" value={form.company} onChange={(e) => set("company", e.target.value)} />
                </label>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="kb-field">
                <span>WhatsApp</span>
                <input className="kb-control" value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="(91) 9 0000-0000" />
              </label>
              <label className="kb-field">
                <span>E-mail</span>
                <input className="kb-control" value={form.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" autoCapitalize="off" />
              </label>
            </div>

            <div className="grid grid-cols-[1fr_88px] gap-3 sm:grid-cols-[140px_1fr_88px]">
              <label className="kb-field col-span-2 sm:col-span-1">
                <span>CEP</span>
                <input className="kb-control" value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} inputMode="numeric" />
              </label>
              <label className="kb-field">
                <span>Cidade</span>
                <input className="kb-control" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </label>
              <label className="kb-field">
                <span>UF</span>
                <input className="kb-control uppercase" value={form.state} onChange={(e) => set("state", e.target.value.slice(0, 2))} maxLength={2} />
              </label>
            </div>
            <label className="kb-field">
              <span>Endereço</span>
              <input className="kb-control" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua, número, bairro" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="kb-field">
                <span>Instagram</span>
                <input className="kb-control" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@marca" autoCapitalize="off" />
              </label>
              <label className="kb-field">
                <span>Site</span>
                <input className="kb-control" value={form.website} onChange={(e) => set("website", e.target.value)} inputMode="url" autoCapitalize="off" />
              </label>
              {isPJ && (
                <>
                  <label className="kb-field">
                    <span>Cargo de quem fala com você</span>
                    <input className="kb-control" value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="Ex.: sócio, marketing" />
                  </label>
                  <label className="kb-field">
                    <span>Inscrição estadual</span>
                    <input className="kb-control" value={form.stateRegistration} onChange={(e) => set("stateRegistration", e.target.value)} />
                  </label>
                </>
              )}
            </div>

            <label className="kb-field">
              <span>Situação</span>
              <select className="kb-control" value={form.status} onChange={(e) => set("status", e.target.value)}>
                {CONTACT_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="kb-field">
              <span>Notas</span>
              <textarea className="kb-control" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Como chegou, o que precisa, preferências…" />
            </label>

            {formError && <p className="kb-tag late w-full justify-start rounded-xl! px-3! py-2! text-sm">{formError}</p>}

            <div className="flex gap-3 pt-1">
              {editing !== "new" && (
                <button type="button" className="kb-btn-ghost" onClick={archive}>
                  Arquivar
                </button>
              )}
              <button type="submit" disabled={saving} className="kb-btn flex-1">
                {saving ? "Salvando…" : editing === "new" ? "Cadastrar" : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
