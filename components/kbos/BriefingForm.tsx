"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { BRIEFING_CATEGORIES, type BriefingField } from "@/lib/kbos/briefing-forms";
function Field({ f, value, onChange }: { f: BriefingField; value: string; onChange: (v: string) => void }) {
  const cls =
    "mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] outline-none placeholder:text-white/25 focus:border-white/50";
  return (
    <div>
      <label className="block text-[12px] uppercase tracking-[0.2em] text-white/50">
        {f.label} {f.required && <span className="text-white/80">*</span>}
      </label>
      {f.type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={f.placeholder} className={cls} />
      ) : f.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} appearance-none`}>
          <option value="">Selecionar...</option>
          {f.options?.map((o) => (
            <option key={o} value={o} className="bg-[#12122a]">{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

export default function BriefingForm() {
  const { categoria } = useParams<{ categoria: string }>();
  const router = useRouter();
  const cat = BRIEFING_CATEGORIES.find((c) => c.id === categoria);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!cat) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] px-5 text-[#F4F1EC]">
        <div className="text-center">
          <p className="text-white/60">Categoria não encontrada.</p>
          <Link href="/briefing" className="mt-4 inline-block text-white underline">Ver categorias</Link>
        </div>
      </main>
    );
  }

  const backHref = `/briefing/${categoria}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFailed(false);
    setLoading(true);
    try {
      const res = await fetch("/api/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoria, respostas: values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao enviar.");
      router.push(`/briefing/ver/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setFailed(true);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0B1E] px-5 pb-20 pt-24 text-[#F4F1EC] md:pt-28">
      <form onSubmit={submit} className="mx-auto max-w-2xl">
        <Link href={backHref} className="text-[11px] uppercase tracking-[0.3em] text-white/45 hover:text-white">
          ← Sobre {cat.label}
        </Link>
        <p className="mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45">Briefing · {cat.label} · {cat.baseValue}</p>
        <h1 className="font-display mt-3 text-4xl font-light md:text-5xl">Conte os detalhes</h1>
        <div className="mt-8 flex flex-col gap-5">
          {cat.fields.map((f) => (
            <Field key={f.name} f={f} value={values[f.name] || ""} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        {failed && (
          <a
            href={`https://wa.me/5591993743109?text=${encodeURIComponent("Olá! Preenchi o briefing de " + (cat?.label ?? "projeto") + " e quero conversar.")}`}
            target="_blank"
            rel="noopener"
            className="mt-4 block rounded-full border border-[#25D366]/50 bg-[#25D366]/10 py-3.5 text-center text-sm font-bold uppercase tracking-[0.18em] text-[#25D366]"
          >
            Prefiro chamar no WhatsApp →
          </a>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-8 w-full rounded-full bg-white py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02] disabled:opacity-60"
        >
          {loading ? "Enviando..." : "Enviar briefing"}
        </button>
        <p className="mt-4 text-center text-[13px] font-light text-white/40">
          Sem compromisso — usamos para montar seu orçamento e contrato.
        </p>
      </form>
    </main>
  );
}
