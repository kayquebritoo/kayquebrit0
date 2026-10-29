"use client";
import { useCallback, useEffect, useState } from "react";

type Member = { userId: string; name: string; email: string; access?: string };
type Candidate = { email: string; name: string; company: string | null; hasAccount: boolean };
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Painel do projeto: outras pessoas do cliente que veem o projeto, as tarefas e o calendário no portal. */
export default function ProjectMembers({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Member[]>([]);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newPerson, setNewPerson] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [link, setLink] = useState<{ url: string; phone: string | null; name: string } | null>(null);
  const base = `/api/admin/projects/${projectId}/members/`;

  const load = useCallback(async () => {
    const r = await fetch(base);
    if (!r.ok) return;
    const j = await r.json();
    setItems(j.items ?? []);
    setSuggestions(j.suggestions ?? []);
  }, [base]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  // Busca enquanto digita: contas do portal e contatos do CRM (nome, e-mail ou empresa).
  useEffect(() => {
    const q = email.trim();
    if (q.length < 2) { const t = setTimeout(() => setCandidates([]), 0); return () => clearTimeout(t); }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${base}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setCandidates(((await r.json()).candidates ?? []).filter((c: Candidate) => !items.some((m) => m.email.toLowerCase() === c.email)));
      } catch { /* digitando: busca anterior cancelada */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [email, base, items]);

  async function add(ev: React.FormEvent | null, to = email) {
    ev?.preventDefault(); setBusy(true); setMsg(""); setLink(null);
    try {
      const body: Record<string, string> = { email: to.trim() };
      if (newPerson && name.trim()) { body.name = name.trim(); if (phone.trim()) body.phone = phone.trim(); }
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        if (j.needsName) { setNewPerson(true); setMsg("E-mail novo: diga o nome (e o WhatsApp, se tiver) e confirme."); return; }
        throw new Error(j.error || "Não consegui dar o acesso.");
      }
      setEmail(""); setName(""); setPhone(""); setNewPerson(false); setCandidates([]);
      if (j.accessUrl) {
        setLink({ url: j.accessUrl, phone: j.phone ?? null, name: j.name });
        setMsg(`Conta criada para ${j.name}, que já vê este projeto. Mande o link de acesso abaixo (vale uma vez, 24 h).`);
      } else setMsg(`${j.name} agora vê este projeto no portal.`);
      await load();
    } catch (x) { setMsg(x instanceof Error ? x.message : "Erro."); } finally { setBusy(false); }
  }
  const share = link?.phone ? `https://wa.me/${link.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Oi, ${link.name.split(" ")[0]}! Este é o seu acesso ao KBOS: ${link.url}\nToque em "Entrar no meu espaço" e crie seu usuário e senha. O link vale uma única vez, por 24 horas.`)}` : "";
  async function setAccess(m: Member, access: string) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: m.userId, access }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Não consegui mudar o acesso.");
      setMsg(access === "gestao" ? `${m.name} agora planeja e roteiriza o conteúdo no portal.` : `${m.name} agora só acompanha e aprova.`);
      await load();
    } catch (x) { setMsg(x instanceof Error ? x.message : "Erro."); } finally { setBusy(false); }
  }
  async function remove(m: Member) {
    if (!confirm(`Tirar o acesso de ${m.name} a este projeto?`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${base}?userId=${m.userId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Não consegui tirar o acesso.");
      await load();
    } catch (x) { setMsg(x instanceof Error ? x.message : "Erro."); } finally { setBusy(false); }
  }

  return (
    <div className="kb-glass mt-4 grid gap-3 p-4">
      <div>
        <h3 className="text-base font-semibold">Acesso compartilhado no portal</h3>
        <p className="kb-faint text-xs">Além do cliente titular. Veem projeto, tarefas, calendário, arquivos e chat. Cobranças continuam só com o titular. Com <b>Gestão de conteúdo</b> (ex.: gerente de marketing) a pessoa vê o calendário inteiro, cria, roteiriza, edita, cancela e escolhe os takes no Lume.</p>
      </div>
      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((m) => (
            <li key={m.userId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{m.name} <span className="kb-faint">· {m.email}</span></span>
              <span className="flex shrink-0 gap-2">
                <select className="kb-control min-h-11" aria-label={`Nível de ${m.name}`} value={m.access ?? "acompanhar"} disabled={busy} onChange={(e) => void setAccess(m, e.target.value)}>
                  <option value="acompanhar">Acompanha e aprova</option>
                  <option value="gestao">Gestão de conteúdo</option>
                </select>
                <button type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => remove(m)}>Remover</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="grid gap-2">
          <p className="kb-faint text-xs">Da mesma empresa, já com conta no portal:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((m) => <button key={m.userId} type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => void add(null, m.email)}>+ {m.name}</button>)}
          </div>
        </div>
      )}
      <form onSubmit={add} className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <input className="kb-control min-w-0 flex-1" type="text" inputMode="email" autoComplete="off" required aria-label="Buscar pessoa ou digitar e-mail"
            placeholder="Buscar no CRM (nome, e-mail, empresa) ou digitar e-mail" value={email}
            onChange={(e) => { setEmail(e.target.value); setNewPerson(false); setMsg(""); }} />
          <button className="kb-btn min-h-11" disabled={busy || !isEmail(email)}>{busy ? "Salvando…" : newPerson ? "Criar e dar acesso" : "Dar acesso"}</button>
        </div>
        {candidates.length > 0 && !newPerson && (
          <ul className="grid gap-1" aria-label="Pessoas encontradas">
            {candidates.map((c) => (
              <li key={c.email}>
                <button type="button" className="kb-chip min-h-11 w-full justify-between text-left" disabled={busy} onClick={() => void add(null, c.email)}>
                  <span className="min-w-0 truncate">{c.name} <span className="kb-faint">· {c.email}{c.company ? ` · ${c.company}` : ""}</span></span>
                  <span className="kb-faint shrink-0 text-xs">{c.hasAccount ? "Dar acesso" : "Criar conta e dar acesso"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {isEmail(email) && !candidates.some((c) => c.email === email.trim().toLowerCase()) && !newPerson && (
          <p className="kb-faint text-xs">Não achou? Toque em <b>Dar acesso</b>: se o e-mail for novo, a conta é criada aqui mesmo.</p>
        )}
        {newPerson && (
          <div className="flex flex-wrap gap-2">
            <input className="kb-control min-w-0 flex-1" required placeholder="Nome da pessoa" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input className="kb-control min-w-0 flex-1" inputMode="tel" placeholder="WhatsApp (com DDD, opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        )}
      </form>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {link && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="kb-chip min-h-11" onClick={() => navigator.clipboard?.writeText(link.url)}>Copiar link de acesso</button>
          {share && <a className="kb-chip min-h-11 items-center" href={share} target="_blank" rel="noopener noreferrer">Enviar acesso no WhatsApp ↗</a>}
        </div>
      )}
    </div>
  );
}
