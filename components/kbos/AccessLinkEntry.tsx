"use client";
import Image from "next/image";
import Link from "next/link";
import { useState,useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const onHash=(cb:()=>void)=>{window.addEventListener('hashchange',cb);return()=>window.removeEventListener('hashchange',cb);};
const readToken=()=>{const t=window.location.hash.slice(1).trim();return /^[0-9a-f]{64}$/i.test(t)?t:'';};
async function api(url:string,method:string,body:unknown){const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível continuar.');return j;}
/**
 * Tela do link de acesso: o token fica no fragmento e só é gasto no clique (POST), nunca ao abrir a página.
 * Depois de entrar, a pessoa define usuário e senha para os próximos logins.
 */
export default function AccessLinkEntry(){
 const router=useRouter();
 // null = ainda no servidor (o fragmento só existe no navegador).
 const token=useSyncExternalStore(onHash,readToken,()=>null);
 const [dest,setDest]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false);
 async function enter(){
  if(!token)return;setBusy(true);setError('');
  try{const j=await api('/api/auth/link/','POST',{token});window.history.replaceState(null,'',window.location.pathname);setDest(j.dest||'/portal');}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.');}finally{setBusy(false);}
 }
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{await api('/api/auth/me/','PATCH',{username});await api('/api/auth/password/','POST',{password});router.replace(dest||'/portal');router.refresh();}
  catch(x){setError(x instanceof Error?x.message:'Não foi possível salvar.');setBusy(false);}
 }
 const invalid=token===''&&!dest;
 return <main className="kbos auth-page">
  <header className="auth-top"><Link href="/" aria-label="Kayque Brito — voltar ao site"><Image src="/logo-kayque.png" alt="Kayque Brito" width={150} height={58} priority className="h-9 w-auto brightness-0 invert"/></Link><span>KBOS · ESPAÇO DO CLIENTE</span></header>
  <div className="auth-layout">
   <section className="auth-card" aria-labelledby="link-title">
    <p className="auth-kicker">{dest?'PRIMEIRO ACESSO':'SEU ACESSO'}</p>
    <h1 id="link-title">{dest?'Crie seu usuário e senha.':invalid?'Link incompleto.':'Seu espaço está pronto.'}</h1>
    <p className="auth-description">{dest?'Você vai usá-los nos próximos acessos. O seu e-mail também continua valendo como usuário.':invalid?'Abra o link exatamente como recebeu ou peça um novo ao Kayque.':'Toque no botão para entrar. Este link vale uma única vez.'}</p>
    {error&&<p className="auth-message auth-error" role="alert">{error}</p>}
    {dest?<form onSubmit={save} className="space-y-5"><fieldset disabled={busy} className="min-w-0 space-y-5">
     <label className="kb-field">Usuário<input className="kb-control" required autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-z][a-z0-9._\-]{2,29}" maxLength={30} value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="Ex.: thalita.atalaia" autoFocus/><span className="text-xs kb-muted">3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.</span></label>
     <div><label className="kb-field" htmlFor="link-password">Senha</label><div className="auth-password"><input id="link-password" className="kb-control" required minLength={8} maxLength={256} type={show?'text':'password'} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Pelo menos 8 caracteres"/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(v=>!v)}>{show?'Ocultar':'Mostrar'}</button></div></div>
     <button type="submit" className="kb-btn w-full">{busy?'Salvando…':'Salvar e entrar no meu espaço'}</button>
    </fieldset></form>
    :!invalid&&<button type="button" className="kb-btn w-full" disabled={busy||token===null} onClick={enter}>{busy?'Entrando…':'Entrar no meu espaço'}</button>}
    {!dest&&<p className="auth-help"><Link href="/entrar/">Entrar com usuário e senha</Link> · <a href="https://wa.me/5591993743109" target="_blank" rel="noreferrer">Fale comigo.</a></p>}
   </section>
  </div><footer className="auth-footer"><Link href="/">← Voltar ao site</Link><span>Feito para simplificar o que vem a seguir.</span></footer>
 </main>;
}
