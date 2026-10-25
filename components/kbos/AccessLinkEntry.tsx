"use client";
import Image from "next/image";
import Link from "next/link";
import { useState,useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const onHash=(cb:()=>void)=>{window.addEventListener('hashchange',cb);return()=>window.removeEventListener('hashchange',cb);};
const readToken=()=>{const t=window.location.hash.slice(1).trim();return /^[0-9a-f]{64}$/i.test(t)?t:'';};
/** Tela do link de acesso: o token fica no fragmento e só é gasto no clique (POST), nunca ao abrir a página. */
export default function AccessLinkEntry(){
 const router=useRouter();
 // null = ainda no servidor (o fragmento só existe no navegador).
 const token=useSyncExternalStore(onHash,readToken,()=>null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function enter(){
  if(!token)return;setBusy(true);setError('');
  try{const r=await fetch('/api/auth/link/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível entrar.');
   window.history.replaceState(null,'',window.location.pathname);router.replace(j.dest||'/portal');router.refresh();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.');setBusy(false);}
 }
 const invalid=token==='';
 return <main className="kbos auth-page">
  <header className="auth-top"><Link href="/" aria-label="Kayque Brito — voltar ao site"><Image src="/logo-kayque.png" alt="Kayque Brito" width={150} height={58} priority className="h-9 w-auto brightness-0 invert"/></Link><span>KBOS · ESPAÇO DO CLIENTE</span></header>
  <div className="auth-layout">
   <section className="auth-card" aria-labelledby="link-title">
    <p className="auth-kicker">SEU ACESSO</p>
    <h1 id="link-title">{invalid?'Link incompleto.':'Seu espaço está pronto.'}</h1>
    <p className="auth-description">{invalid?'Abra o link exatamente como recebeu ou peça um novo ao Kayque.':'Toque no botão para entrar. Este link vale uma única vez.'}</p>
    {error&&<p className="auth-message auth-error" role="alert">{error}</p>}
    {!invalid&&<button type="button" className="kb-btn w-full" disabled={busy||token===null} onClick={enter}>{busy?'Entrando…':'Entrar no meu espaço'}</button>}
    <p className="auth-help"><Link href="/entrar/">Entrar com usuário e senha</Link> · <a href="https://wa.me/5591993743109" target="_blank" rel="noreferrer">Fale comigo.</a></p>
   </section>
  </div><footer className="auth-footer"><Link href="/">← Voltar ao site</Link><span>Feito para simplificar o que vem a seguir.</span></footer>
 </main>;
}
