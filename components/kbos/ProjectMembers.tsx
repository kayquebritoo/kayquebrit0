"use client";
import { useCallback, useEffect, useState } from "react";

type Member = { userId: string; name: string; email: string };

/** Painel do projeto: outras pessoas do cliente que veem o projeto, as tarefas e o calendário no portal. */
export default function ProjectMembers({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const base = `/api/admin/projects/${projectId}/members/`;

  const load = useCallback(async () => {
    const r = await fetch(base);
    if (r.ok) setItems((await r.json()).items ?? []);
  }, [base]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function add(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui dar o acesso.");
      setEmail(""); setMsg(`${j.name} agora vê este projeto no portal.`); await load();
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
        <p className="kb-faint text-xs">Além do cliente titular. Veem projeto, tarefas, calendário, arquivos e chat. Cobranças continuam só com o titular.</p>
      </div>
      {items.length > 0 && (
        <ul className="grid gap-2">
          {items.map((m) => (
            <li key={m.userId} className="flex min-w-0 items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{m.name} <span className="kb-faint">· {m.email}</span></span>
              <button type="button" className="kb-chip min-h-11 shrink-0" disabled={busy} onClick={() => remove(m)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input className="kb-control min-w-0 flex-1" type="email" inputMode="email" required placeholder="E-mail da conta do portal" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="kb-btn min-h-11" disabled={busy}>{busy ? "Salvando…" : "Dar acesso"}</button>
      </form>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
