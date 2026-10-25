"use client";
import { useState } from "react";

/** Ficha do cliente: cria o acesso ao portal e liga os projetos dele (login por código no WhatsApp ou e-mail). */
export default function PortalAccess({ contactId, email, phone, name }: { contactId: string; email?: string | null; phone?: string | null; name?: string }) {
  const [open, setOpen] = useState(false);
  const [e, setE] = useState(email || "");
  const [p, setP] = useState(phone || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState<{ url: string; phone: string | null } | null>(null);
  const [link, setLink] = useState<{ url: string; phone: string | null; until: string } | null>(null);

  async function go(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setMsg(""); setOk(null);
    try {
      const r = await fetch("/api/admin/portal-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, email: e, phone: p, name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui criar o acesso.");
      setOk({ url: j.loginUrl, phone: j.phone });
      setMsg(`${j.created ? "Acesso criado" : "Acesso já existia"} para ${j.email}. ${j.linked} projeto${j.linked === 1 ? "" : "s"} ligado${j.linked === 1 ? "" : "s"} a ele.`);
    } catch (x) { setMsg(x instanceof Error ? x.message : "Erro."); } finally { setBusy(false); }
  }
  // Quando o código não chega: link de uso único (24 h) para enviar pelo WhatsApp do Kayque.
  async function makeLink() {
    setBusy(true); setMsg(""); setLink(null);
    try {
      const r = await fetch("/api/admin/portal-access/link/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, email: e, phone: p, name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui gerar o link.");
      const until = new Date(j.expiresAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      setLink({ url: j.accessUrl, phone: j.phone, until });
      setMsg(`Link gerado para ${j.email}. Vale uma vez, até ${until}. Gerar outro não cancela este.`);
    } catch (x) { setMsg(x instanceof Error ? x.message : "Erro."); } finally { setBusy(false); }
  }
  const linkShare = link ? `https://wa.me/${(link.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Oi! Este é o seu acesso ao KBOS: ${link.url}\nToque em "Entrar no meu espaço". O link vale uma única vez, até ${link.until}.`)}` : "";
  const share = ok ? `https://wa.me/${(ok.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Oi! Seu espaço no KBOS está pronto: ${ok.url}\nEntre com o seu e-mail e peça o código por WhatsApp.`)}` : "";

  return (
    <div className="kb-glass min-w-0 space-y-3 p-4">
      <button type="button" className="kb-chip min-h-11" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Acesso ao portal {open ? "▴" : "▾"}</button>
      {open && (
        <form onSubmit={go} className="grid gap-3">
          <label className="kb-field">E-mail do login<input className="kb-control" type="email" inputMode="email" required value={e} onChange={(x) => setE(x.target.value)} /></label>
          <label className="kb-field">WhatsApp (com DDD)<input className="kb-control" inputMode="tel" value={p} onChange={(x) => setP(x.target.value)} placeholder="91 99999-9999" /></label>
          <button className="kb-btn min-h-11" disabled={busy}>{busy ? "Criando…" : "Criar acesso e ligar projetos"}</button>
          <button type="button" className="kb-btn-ghost min-h-11" disabled={busy || !e} onClick={makeLink}>{busy ? "Gerando…" : "Gerar link de acesso (uso único)"}</button>
          {msg && <p role="status" className="text-sm">{msg}</p>}
          {link && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="kb-chip min-h-11" onClick={() => navigator.clipboard?.writeText(link.url)}>Copiar link de acesso</button>
              {link.phone && <a className="kb-chip min-h-11 items-center" href={linkShare} target="_blank" rel="noopener noreferrer">Enviar acesso no WhatsApp ↗</a>}
            </div>
          )}
          {ok && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="kb-chip min-h-11" onClick={() => navigator.clipboard?.writeText(ok.url)}>Copiar link</button>
              {ok.phone && <a className="kb-chip min-h-11 items-center" href={share} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp ↗</a>}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
