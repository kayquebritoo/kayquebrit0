"use client";
import { useCallback, useEffect, useState } from "react";

type Media = { id: string; name: string; kind: string; size: number; expectedSize: number; status: string };
const mb = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;

/** Editor do post (equipe): arquivo final + o KBOS publica no Instagram/Facebook no horário (ou agora). */
export default function PostPublishing({ postId, scheduledAt, onChanged }: { postId: string; scheduledAt: string | null; onChanged: () => void }) {
  const [items, setItems] = useState<Media[]>([]);
  const [chunk, setChunk] = useState(8 * 1024 * 1024);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const base = `/api/admin/social/${postId}/media/`;
  const load = useCallback(async () => {
    const r = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (r?.ok) { const j = await r.json(); setItems(j.items ?? []); if (j.chunk) setChunk(j.chunk); }
  }, [base]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg("");
    try {
      for (const file of Array.from(files)) {
        let mediaId = "", offset = 0;
        while (offset < file.size || (offset === 0 && !mediaId)) {
          const part = file.slice(offset, offset + chunk);
          const headers: Record<string, string> = { "content-type": "application/octet-stream" };
          if (mediaId) { headers["x-media-id"] = mediaId; headers["x-offset"] = String(offset); } else { headers["x-file-name"] = encodeURIComponent(file.name); headers["x-file-size"] = String(file.size); }
          let r: Response | null = null;
          for (let tryN = 0; tryN < 3 && !r?.ok; tryN++) r = await fetch(base, { method: "POST", headers, body: part }).catch(() => null);
          const j = await r?.json().catch(() => ({}));
          if (!r?.ok) throw new Error(j?.error || `Falhou o envio de ${file.name}.`);
          mediaId = j.id; offset = j.resumeAt ?? j.size;
          setProgress({ name: file.name, pct: Math.round((offset / file.size) * 100) });
          if (j.done) break;
        }
      }
      setProgress(null); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro no envio."); setProgress(null); await load(); } finally { setBusy(false); }
  }
  async function del(m: Media) {
    await fetch(`${base}?mediaId=${m.id}`, { method: "DELETE" }); await load();
  }
  async function move(i: number, d: number) {
    const ids = items.map((m) => m.id);
    const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const r = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ order: ids }) });
    if (r.ok) setItems((await r.json()).items ?? []);
  }
  async function schedule(quando: "agora" | "data") {
    if (quando === "agora" && !confirm("Publicar agora no Instagram/Facebook marcados? Sai em até 1 minuto.")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/admin/social/${postId}/schedule/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quando }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui agendar.");
      setMsg(quando === "agora" ? "Na fila: sai em até 1 minuto." : `Agendado para ${new Date(j.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Belem" })}.`);
      onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro."); } finally { setBusy(false); }
  }
  async function unschedule() {
    setBusy(true);
    const r = await fetch(`/api/admin/social/${postId}/schedule/`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${j.removidas ?? 0} rede(s) fora da fila.` : "Não consegui."); setBusy(false); onChanged();
  }

  const ready = items.some((m) => m.status === "pronto");
  return (
    <section className="space-y-2" aria-label="Publicar pelo KBOS">
      <p className="kb-faint text-[11px] uppercase tracking-[0.18em]">Arquivo final · publicar pelo KBOS</p>
      {items.map((m, i) => (
        <div key={m.id} className="kb-row gap-2">
          <span className="min-w-0 truncate text-sm">{i + 1}. {m.kind === "video" ? "🎬" : "🖼"} {m.name} <span className="kb-faint text-xs">{m.status === "pronto" ? mb(m.size) : `incompleto (${mb(m.size)} de ${mb(m.expectedSize)})`}</span></span>
          <span className="flex shrink-0 gap-1">
            {items.length > 1 && <><button type="button" className="kb-chip min-h-9 min-w-9" aria-label="Subir" onClick={() => void move(i, -1)}>↑</button><button type="button" className="kb-chip min-h-9 min-w-9" aria-label="Descer" onClick={() => void move(i, 1)}>↓</button></>}
            <button type="button" className="kb-chip min-h-9 min-w-9" aria-label={`Remover ${m.name}`} onClick={() => void del(m)}>×</button>
          </span>
        </div>
      ))}
      <label className="kb-btn-ghost min-h-11 inline-flex w-full cursor-pointer items-center justify-center">
        {progress ? `Enviando ${progress.name}… ${progress.pct}%` : "+ Enviar arquivo final (JPG ou MP4)"}
        <input type="file" accept="image/jpeg,video/mp4,video/quicktime" multiple className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      </label>
      <p className="kb-faint text-xs">Carrossel: envie as imagens na ordem (até 10). Reels: um MP4 vertical. A legenda é a do post.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="kb-btn min-h-11 flex-1" disabled={busy || !ready || !scheduledAt} onClick={() => void schedule("data")}>Agendar no KBOS</button>
        <button type="button" className="kb-btn-ghost min-h-11" disabled={busy || !ready} onClick={() => void schedule("agora")}>Publicar agora</button>
        <button type="button" className="kb-chip min-h-11" disabled={busy} onClick={() => void unschedule()}>Tirar da fila</button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}
