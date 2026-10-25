"use client";
import { useState } from "react";

/** "Enviar link de conexão": link de 7 dias para o cliente conectar as redes dele sem senha do KBOS. */
export default function ConnectLinkButton({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function create() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/social/links/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setMsg(j.error || "Não consegui criar o link."); return; }
    setLink(j);
  }
  const text = link ? `Oi! Para o KBOS publicar os posts${projectName ? ` da ${projectName}` : ""} nas suas redes, conecte por aqui (o login é no site oficial de cada rede, ninguém vê sua senha): ${link.url}` : "";
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMsg("Mensagem copiada."); } catch { setMsg("Copie o link manualmente."); }
  }

  if (!link) {
    return (
      <span className="flex flex-col gap-1">
        <button type="button" className="kb-btn-ghost min-h-11" disabled={busy} onClick={() => void create()}>{busy ? "Criando…" : "Enviar link de conexão"}</button>
        {msg && <small role="status" className="kb-faint text-xs">{msg}</small>}
      </span>
    );
  }
  return (
    <div className="kb-card w-full gap-2">
      <p className="text-sm">Link para o cliente (vale até {new Date(link.expiresAt).toLocaleDateString("pt-BR")}, só para {projectName || "este cliente"}):</p>
      <input readOnly className="kb-control font-mono text-xs" value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de conexão" />
      <div className="flex flex-wrap gap-2">
        <a className="kb-btn min-h-11" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Mandar no WhatsApp</a>
        <button type="button" className="kb-btn-ghost min-h-11" onClick={() => void copy()}>Copiar mensagem</button>
      </div>
      {msg && <small role="status" className="kb-faint text-xs">{msg}</small>}
    </div>
  );
}
