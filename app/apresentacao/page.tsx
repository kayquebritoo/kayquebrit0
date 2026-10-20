import type { Metadata } from "next";
import Link from "next/link";
import LumeMark from "@/components/kbos/lume/LumeMark";

export const metadata: Metadata = {
  title: "KBOS — um sistema, tudo da sua operação",
  description: "Comercial, projetos, financeiro, atendimento e o Lume, o acervo inteligente de fotos e vídeos, num só lugar.",
};

const MODULOS = [
  { t: "Comercial", d: "Contatos, funil, orçamentos e contratos de 2 páginas com assinatura digital simples.", k: "01" },
  { t: "Projetos e tarefas", d: "Etapas, prazos, timer de tempo e aprovação de arquivos pelo cliente, com aviso no WhatsApp.", k: "02" },
  { t: "Financeiro", d: "Entradas, saídas, vencimentos e visão de caixa sem planilha paralela.", k: "03" },
  { t: "Atendimento", d: "Conversas de WhatsApp e agente de IA no mesmo lugar do cliente.", k: "04" },
  { t: "Portal do cliente", d: "Seu cliente acompanha etapas, aprova entregas e vê tudo sem pedir por mensagem.", k: "05" },
  { t: "Lume", d: "O gerenciador de arquivos inteligente do KBOS: ache qualquer foto ou vídeo descrevendo ou falando.", k: "06", destaque: true },
];

export default function Apresentacao() {
  return (
    <main className="ap">
      <style>{`
        .ap{min-height:100dvh;background:#11101E;color:#EDE6EC;overflow-x:clip;position:relative;padding:env(safe-area-inset-top) 16px 64px}
        .ap *{box-sizing:border-box;min-width:0}
        .ap-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
        .ap-bg i{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;will-change:transform;animation:ap-drift 26s ease-in-out infinite alternate}
        .ap-bg i:nth-child(1){width:60vmax;height:60vmax;left:-20vmax;top:-20vmax;background:#350C85}
        .ap-bg i:nth-child(2){width:50vmax;height:50vmax;right:-18vmax;top:30vh;background:#4F12C7;animation-delay:-9s}
        .ap-bg i:nth-child(3){width:34vmax;height:34vmax;left:20vw;bottom:-14vmax;background:#E80EFD;opacity:.22;animation-delay:-16s}
        @keyframes ap-drift{to{transform:translate3d(6vmax,4vmax,0) scale(1.12)}}
        .ap-in{position:relative;z-index:1;max-width:1080px;margin:0 auto}
        .ap-hero{padding:72px 0 40px;text-align:left}
        .ap-hero h1{font-family:var(--font-display,inherit);font-size:clamp(2.2rem,8vw,4.6rem);line-height:1.04;margin:18px 0 0;overflow-wrap:anywhere}
        .ap-grad{background:linear-gradient(90deg,#EDE6EC,#8B5CF6 60%,#E80EFD);-webkit-background-clip:text;background-clip:text;color:transparent}
        .ap-sub{color:#BDB7BC;font-size:1.05rem;line-height:1.6;max-width:56ch;margin-top:18px}
        .ap-cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
        .ap-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;font-weight:700;text-decoration:none;transition:transform .25s,box-shadow .25s}
        .ap-btn:active{transform:scale(.96)}
        .ap-btn.p{background:linear-gradient(90deg,#4F12C7,#8B2BE0 70%,#E80EFD);color:#fff;box-shadow:0 10px 30px -10px #4F12C7}
        .ap-btn.g{border:1px solid rgba(237,230,236,.22);color:#EDE6EC;background:rgba(255,255,255,.05)}
        .ap-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
        .ap-card{padding:22px;border-radius:22px;border:1px solid rgba(237,230,236,.12);background:rgba(255,255,255,.05);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);transition:transform .35s,border-color .35s}
        .ap-card:hover{transform:translateY(-4px);border-color:rgba(232,14,253,.4)}
        .ap-card small{color:#BDB7BC;letter-spacing:.2em}
        .ap-card h3{margin:8px 0 6px;font-size:1.2rem}
        .ap-card p{margin:0;color:#BDB7BC;line-height:1.55;font-size:.95rem}
        .ap-card.d{grid-column:1/-1;display:grid;gap:18px;align-items:center;background:linear-gradient(135deg,rgba(79,18,199,.28),rgba(53,12,133,.18) 60%,rgba(232,14,253,.12))}
        @media(min-width:720px){.ap-card.d{grid-template-columns:auto 1fr}}
        .ap-wave{display:flex;align-items:center;gap:4px;height:46px;margin-top:14px}
        .ap-wave b{width:5px;border-radius:3px;background:linear-gradient(#4F12C7,#E80EFD);animation:ap-w 1.6s ease-in-out infinite alternate;height:30%}
        @keyframes ap-w{to{height:100%}}
        .ap h2{font-family:var(--font-display,inherit);font-size:clamp(1.5rem,5vw,2.3rem);margin:56px 0 18px}
        .ap-foot{margin-top:56px;color:#BDB7BC;font-size:.9rem}
        @media(prefers-reduced-motion:reduce){.ap-bg i,.ap-wave b{animation:none}.ap-card,.ap-btn{transition:none}}
      `}</style>
      <div className="ap-bg" aria-hidden><i /><i /><i /></div>
      <div className="ap-in">
        <header className="ap-hero">
          <p style={{ letterSpacing: ".28em", fontSize: 12, color: "#BDB7BC" }}>KBOS · KAYQUE BRITO</p>
          <h1>Um sistema para <span className="ap-grad">toda a sua operação</span>.</h1>
          <p className="ap-sub">Do primeiro contato à entrega final: orçamento, contrato, projeto, tarefas, financeiro, atendimento e os arquivos do seu negócio, tudo conectado e feito sob medida com agilidade, inovação e inteligência.</p>
          <div className="ap-cta">
            <Link className="ap-btn p" href="/admin">Entrar no KBOS</Link>
            <Link className="ap-btn g" href="/portal">Portal do cliente</Link>
          </div>
        </header>

        <h2>O que ele faz</h2>
        <div className="ap-grid">
          {MODULOS.map((m) => m.destaque ? (
            <article key={m.k} className="ap-card d">
              <LumeMark size={72} animate />
              <div>
                <small>{m.k} · NOVO</small>
                <h3>{m.t} — o acervo inteligente do KBOS</h3>
                <p>{m.d} Fotos e vídeos de cada cliente e empresa ficam a uma busca de distância, no celular como app instalado.</p>
                <div className="ap-wave" aria-hidden>
                  {Array.from({ length: 28 }, (_, i) => <b key={i} style={{ animationDelay: `${(i % 9) * 0.13}s`, animationDuration: `${1.2 + (i % 5) * 0.2}s` }} />)}
                </div>
              </div>
            </article>
          ) : (
            <article key={m.k} className="ap-card"><small>{m.k}</small><h3>{m.t}</h3><p>{m.d}</p></article>
          ))}
        </div>

        <h2>Como trabalhamos juntos</h2>
        <div className="ap-grid">
          {[["Briefing", "Marca, tom de voz e objetivos validados antes de produzir."], ["Produção", "Etapas visíveis, prazos claros e aprovação de entregas pelo portal."], ["Acervo", "Tudo o que é produzido fica organizado e fácil de achar no Lume."]].map(([t, d]) => (
            <article key={t} className="ap-card"><h3>{t}</h3><p>{d}</p></article>
          ))}
        </div>

        <p className="ap-foot">Kayque Brito · Desenvolvimento de software, design e produção audiovisual.</p>
      </div>
    </main>
  );
}
