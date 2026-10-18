"use client";
import { useCallback, useEffect, useState } from "react";

type Album = { id: string; title: string; brand: string; eventDate: string | null; status: string; expiresAt: string | null; photos: number; authorized: number; downloads: number };
const STATUS: Record<string, string> = { draft: "Rascunho", published: "No ar", closed: "Encerrada" };

export default function Galeria() {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("Atalaia Vip");
  const [date, setDate] = useState("");
  const [days, setDays] = useState("60");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/gallery/albums/", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar.");
      setAlbums(j.albums as Album[]);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Erro ao carregar."); setAlbums([]); }
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  async function create() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/gallery/albums/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, brand, eventDate: date || null, expiresInDays: Number(days) || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não consegui criar.");
      setLink(j.link); setTitle(""); setForm(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não consegui criar."); }
    finally { setBusy(false); }
  }
  async function status(id: string, s: string) {
    await fetch(`/api/admin/gallery/albums/${id}/`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: s }) });
    await load();
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); setMsg("Link copiado."); } catch { setMsg("Copie o link manualmente."); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="kb-muted max-w-xl text-sm">Cada álbum tem um link privado. O cliente escolhe as fotos dele, autoriza o uso nas redes e baixa com a logo pequena do hotel. As fotos entram pela ferramenta de envio no Mac.</p>
        <button type="button" className="kb-btn" onClick={() => setForm((v) => !v)}>+ Novo álbum</button>
      </div>
      {msg && <p role="status" className="kb-tag w-full justify-start rounded-2xl! px-4! py-3! text-sm">{msg}</p>}
      {link && (
        <div className="kb-card grid gap-2 p-4">
          <p className="text-sm font-semibold">Link do álbum (aparece só agora — copie e guarde)</p>
          <input readOnly className="kb-control min-h-12 text-sm" value={link} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="kb-btn-ghost" onClick={() => void copy()}>Copiar link</button>
        </div>
      )}
      {form && (
        <div className="kb-card grid gap-3 p-4">
          <label className="kb-field">Título<input className="kb-control min-h-12 text-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Lounge — sexta 17/10" /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="kb-field">Marca<input className="kb-control min-h-12 text-base" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
            <label className="kb-field">Data<input className="kb-control min-h-12 text-base" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="kb-field">Expira em (dias)<input className="kb-control min-h-12 text-base" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
          </div>
          <button type="button" className="kb-btn" disabled={busy || title.trim().length < 2} onClick={() => void create()}>{busy ? "Criando…" : "Criar álbum"}</button>
        </div>
      )}
      {albums === null && <div className="kb-skel h-24 rounded-2xl" />}
      {albums?.length === 0 && <p className="kb-muted py-8 text-center text-sm">Nenhum álbum ainda. Crie o primeiro.</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {albums?.map((a) => (
          <div key={a.id} className="kb-card min-w-0 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.title}</p>
                <p className="kb-muted text-xs">{a.brand}{a.eventDate ? ` · ${new Date(`${a.eventDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p>
              </div>
              <span className="kb-tag shrink-0">{STATUS[a.status] ?? a.status}</span>
            </div>
            <p className="kb-muted mt-3 text-sm">{a.photos} foto(s) · {a.authorized} autorizada(s) · {a.downloads} download(s)</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {a.status !== "published" && <button type="button" className="kb-btn min-h-11 flex-1" onClick={() => void status(a.id, "published")}>Publicar</button>}
              {a.status === "published" && <button type="button" className="kb-btn-ghost flex-1" onClick={() => void status(a.id, "closed")}>Encerrar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
