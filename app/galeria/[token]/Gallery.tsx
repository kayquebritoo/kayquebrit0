"use client";
import { useEffect, useMemo, useState } from "react";
import PageBackdrop from "@/components/PageBackdrop";

type Photo = { id: string; width: number | null; height: number | null };
type View = { title: string; brand: string; eventDate: string | null; consentText: string; photos: Photo[]; authorized: string[]; guest?: boolean };

const PHONE_KEY = "kbos.galeria.phone";
const read = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem lembrar */ } };
/** Selfie reduzida no aparelho (JPEG ~640px): sai leve e não manda a foto original da câmera. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("img")); i.src = url; });
    const k = Math.min(1, 640 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(url); }
}
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export default function Gallery({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [minor, setMinor] = useState(false);
  const [guardian, setGuardian] = useState("");
  const [selfie, setSelfie] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function call(body?: unknown) {
    const r = await fetch(`/api/gallery/${token}/`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Não consegui carregar. Tente de novo.");
    return j as View & { authorized: string[] };
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const saved = read(PHONE_KEY);
        setView(saved ? await call({ action: "mine", phone: saved }) : await call());
        if (saved) setPhone(saved);
      } catch (e) { setError(e instanceof Error ? e.message : "Link não encontrado."); }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const mine = useMemo(() => new Set(view?.authorized ?? []), [view]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pending = [...picked].filter((id) => !mine.has(id));

  async function authorize() {
    setBusy(true); setError("");
    try {
      await call({ action: "authorize", name, phone, photoIds: pending, minor, guardianName: minor ? guardian : undefined, selfie: selfie || undefined });
      write(PHONE_KEY, phone);
      setView(await call({ action: "mine", phone }));
      setPicked(new Set()); setSheet(false); setAgree(false); setSelfie("");
      setNotice("Pronto! Agora você já pode baixar as fotos autorizadas.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não consegui registrar."); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!confirm("Retirar a autorização de uso de todas as suas fotos nesta galeria?")) return;
    setBusy(true); setError("");
    try {
      await call({ action: "revoke", phone });
      setView(await call({ action: "mine", phone }));
      setNotice("Autorização retirada. Essas fotos não serão mais usadas.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não consegui retirar."); }
    finally { setBusy(false); }
  }

  async function download(id: string) {
    setError("");
    try {
      const r = await fetch(`/api/gallery/${token}/photos/${id}/download/`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Não consegui baixar.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `foto-${id.slice(0, 6)}.jpg`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError(e instanceof Error ? e.message : "Não consegui baixar."); }
  }

  return (
    <main className="relative min-h-screen bg-[#11101E] pb-32 text-[#EDE6EC]">
      <PageBackdrop />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pt-10 sm:px-6">
        {!view && !error && <div className="kb-skel mt-10 h-40 rounded-3xl" />}
        {error && !view && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-[#171527] p-6">
            <p className="font-display text-2xl">Link indisponível</p>
            <p className="mt-2 text-sm text-white/60">{error}</p>
          </div>
        )}
        {view && (
          <>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">{view.brand || "Fotos do seu momento"}{view.eventDate ? ` · ${fmt(view.eventDate)}` : ""}</p>
            <h1 className="font-display mt-2 text-balance text-3xl font-light leading-tight md:text-5xl">{view.title}</h1>
            <p className="mt-3 max-w-2xl text-[15px] font-light leading-relaxed text-white/65">
              Toque nas fotos em que você aparece. Depois de autorizar o uso nas redes, você baixa de graça, com a logo pequena do hotel.
            </p>
            {notice && <p role="status" className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</p>}
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

            <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
              {view.photos.map((p) => {
                const on = picked.has(p.id), ok = mine.has(p.id);
                return (
                  <li key={p.id} className="relative aspect-[4/5] min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#171527]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/gallery/${token}/photos/${p.id}/thumb/`} alt="Foto da galeria" loading="lazy" className="h-full w-full object-cover" onClick={() => setZoom(p.id)} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
                    {ok ? (
                      <button type="button" onClick={() => void download(p.id)} className="absolute bottom-2 left-2 right-2 min-h-11 rounded-xl bg-gradient-to-r from-[#350C85] via-[#4F12C7] to-[#E80EFD]/70 px-3 text-sm font-semibold text-white active:scale-95">Baixar</button>
                    ) : (
                      <button type="button" aria-pressed={on} aria-label={on ? "Tirar seleção" : "Selecionar foto"} onClick={() => toggle(p.id)}
                        className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border text-lg transition active:scale-90 ${on ? "border-transparent bg-[#4F12C7] text-white" : "border-white/40 bg-black/40 text-transparent"}`}>✓</button>
                    )}
                    {ok && <span className="absolute left-2 top-2 rounded-full bg-emerald-400/90 px-2.5 py-1 text-[11px] font-semibold text-[#0B0B1E]">Autorizada</span>}
                  </li>
                );
              })}
            </ul>
            {view.photos.length === 0 && <p className="mt-8 text-sm text-white/50">As fotos deste álbum ainda estão sendo preparadas.</p>}
            {mine.size > 0 && <button type="button" onClick={() => void revoke()} disabled={busy} className="mt-8 min-h-11 text-sm text-white/50 underline underline-offset-4">Retirar minha autorização</button>}
          </>
        )}
      </div>

      {view && pending.length > 0 && !sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#11101E] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setSheet(true)} className="kb-btn w-full">Autorizar e baixar {pending.length} foto{pending.length === 1 ? "" : "s"}</button>
        </div>
      )}

      {sheet && view && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setSheet(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#171527] p-5 sm:rounded-3xl">
            <h2 className="font-display text-2xl font-light">Autorizar uso das fotos</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{view.consentText}</p>
            <label className="kb-field mt-4">Seu nome completo<input className="kb-control min-h-12 text-base" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label className="kb-field mt-3">WhatsApp com DDD<input className="kb-control min-h-12 text-base" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="(91) 9 0000-0000" /></label>
            {!view.guest && (
              <>
                <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-white/80">
                  <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>Tenho menos de 18 anos (quem autoriza é meu responsável)</span>
                </label>
                {minor && <label className="kb-field mt-2">Nome completo do responsável<input className="kb-control min-h-12 text-base" value={guardian} onChange={(e) => setGuardian(e.target.value)} autoComplete="off" /></label>}
                <div className="mt-4">
                  <p className="text-sm text-white/80">Uma selfie rápida, só para provar que foi você quem autorizou.</p>
                  <label className="kb-btn-ghost mt-2 inline-flex min-h-12 cursor-pointer items-center justify-center">
                    {selfie ? "Trocar selfie" : "Tirar selfie"}
                    <input type="file" accept="image/*" capture="user" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setSelfie(await shrink(f)); setError(""); } catch { setError("Não consegui ler a selfie. Tente de novo."); } }} />
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {selfie && <img src={selfie} alt="Sua selfie" className="mt-3 h-24 w-24 rounded-2xl object-cover" />}
                </div>
              </>
            )}
            <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-white/80">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>Li e autorizo o uso das {pending.length} foto(s) selecionada(s).</span>
            </label>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" className="kb-btn-ghost flex-1" onClick={() => setSheet(false)}>Voltar</button>
              <button type="button" className="kb-btn flex-1" disabled={busy || !agree || (!view.guest && !selfie) || (minor && guardian.trim().length < 3)} onClick={() => void authorize()}>{busy ? "Enviando…" : "Autorizar"}</button>
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B1E] p-3" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/gallery/${token}/photos/${zoom}/preview/`} alt="Foto ampliada" className="max-h-full max-w-full rounded-2xl object-contain" />
          <button type="button" aria-label="Fechar" className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">×</button>
        </div>
      )}
    </main>
  );
}
