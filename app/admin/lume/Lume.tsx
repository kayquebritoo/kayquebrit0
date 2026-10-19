"use client";
import { useEffect, useState } from "react";
import LumeMark from "@/components/kbos/lume/LumeMark";
import { LUME_DEFAULT_ENDPOINT, LUME_STORAGE_KEY, parseLumeEndpoint } from "@/lib/kbos/lume";

// O endereço fica só neste navegador (localStorage) e abre no computador de quem clica.
const read = () => { try { return localStorage.getItem(LUME_STORAGE_KEY) || ""; } catch { return ""; } };
const write = (v: string | null) => { try { if (v) localStorage.setItem(LUME_STORAGE_KEY, v); else localStorage.removeItem(LUME_STORAGE_KEY); } catch { /* sem armazenamento: segue sem salvar */ } };

const STEPS = [
  { t: "Agora", d: "Ferramenta interna, rodando no seu Mac a partir do SSD. Busca por descrição, prévia, player, download e filtros." },
  { t: "Piloto", d: "Atalaia VIP: hotel, lounge e praça de alimentação, para achar o take certo do roteiro do mLabs." },
  { t: "Depois", d: "Módulo de mídia dentro do KBOS e, mais à frente, portal privado de clientes com QR e galeria. Ainda não construído." },
];

export default function Lume() {
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { const t = setTimeout(() => { const s = read(); setSaved(s); setValue(s); }, 0); return () => clearTimeout(t); }, []);

  function save() {
    const r = parseLumeEndpoint(value);
    if (!r.ok) { setErr(r.error); return; }
    setErr(""); write(r.url); setSaved(r.url); setValue(r.url);
  }
  function clear() { write(null); setSaved(""); setValue(""); setErr(""); }
  const parsed = saved ? parseLumeEndpoint(saved) : null;
  const openUrl = parsed && parsed.ok ? parsed.url : "";

  return (
    <div className="kb-page mx-auto w-full max-w-4xl space-y-4 pb-10">
      <section className="kb-glass relative overflow-hidden p-5 sm:p-8">
        <div className="lume-halo" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <LumeMark size={84} animate title="Lume" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="kb-chip">Ferramenta interna</span>
              <span className="kb-chip">Roda no seu Mac</span>
              <span className="kb-chip">Em desenvolvimento</span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-light leading-tight sm:text-4xl">Lume <span className="kb-muted">· acervo inteligente</span></h1>
            <p className="mt-2 max-w-xl kb-muted">Ache a cena certa pelo que ela mostra: “chapa mista”, “pôr do sol na praia”. Luz para revelar os momentos que você já gravou.</p>
          </div>
          <div className="lume-wave sm:ml-auto" aria-hidden>{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ ["--i" as string]: i, height: `${[38, 62, 86, 100, 74, 52, 34][i]}%` }} />)}</div>
        </div>
      </section>

      <section className="kb-glass space-y-3 p-5">
        <h2 className="text-lg font-semibold">Abrir o Lume</h2>
        <p className="text-sm kb-muted">O Lume é um programa local: ele lê o SSD no computador onde está ligado. O KBOS não hospeda o Lume, não acessa o SSD e não verifica se ele está rodando. Aqui você só guarda o endereço e abre.</p>
        <label className="kb-field">Endereço no seu computador
          <input className="kb-control min-h-12 text-base" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder={LUME_DEFAULT_ENDPOINT} value={value} onChange={(e) => { setValue(e.target.value); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        </label>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="kb-btn min-h-12" onClick={save}>Salvar neste navegador</button>
          {openUrl && <a className="kb-btn min-h-12" href={openUrl} target="_blank" rel="noopener noreferrer">Abrir Lume ↗</a>}
          {saved && <button className="kb-btn-ghost min-h-12" onClick={clear}>Remover</button>}
        </div>
        <p className="text-xs kb-muted">
          {parsed && parsed.ok && parsed.kind === "este-computador"
            ? "Endereço do próprio computador: só funciona nele, com o Lume ligado e o SSD conectado. Em outro aparelho ele não encontra o SSD."
            : parsed && parsed.ok ? "Endereço da sua rede local: só funciona dentro da mesma rede, com o Lume ligado."
            : "Salvo apenas neste navegador; nada é enviado para o servidor do KBOS. Para ligar o Lume: abra o 3-buscar-acervo no SSD."}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.t} className="kb-glass p-5">
            <p className="cp-eyebrow">{s.t.toUpperCase()}</p>
            <p className="mt-2 text-sm">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="kb-glass space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Identidade</h2>
          <a className="kb-btn-ghost min-h-11" href="/brand/lume/preview.html" target="_blank" rel="noopener noreferrer">Ver folha da marca ↗</a>
        </div>
        <p className="text-sm kb-muted">Símbolo em SVG: uma lente de luz com a onda de som dentro. Criador e Explorador, humano e tecnologia. Arquivos em <code>public/brand/lume/</code>, prontos para o app local reaproveitar.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["dark", "light"] as const).map((v) => (
            <div key={v} className={`flex min-h-28 items-center justify-center rounded-2xl border border-white/10 p-4 ${v === "dark" ? "bg-[#11101E]" : "bg-[#EDE6EC]"}`}>
              <LumeMark size={64} variant={v} animate title={`Símbolo ${v === "dark" ? "escuro" : "claro"}`} />
            </div>
          ))}
          {["#11101E", "#4F12C7", "#350C85", "#EDE6EC"].map((c) => (
            <div key={c} className="hidden min-h-28 items-end rounded-2xl border border-white/10 p-3 text-xs sm:flex" style={{ background: c, color: c === "#EDE6EC" ? "#11101E" : "#EDE6EC" }}>{c}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
