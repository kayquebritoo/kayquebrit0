"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect,useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";

type Mode='password'|'request'|'code'|'define';
export default function EntrarForm(){
 const params=useSearchParams(),router=useRouter();
 const [mode,setMode]=useState<Mode>(params.get('token')?'define':'password');
 const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false);
 const [channel,setChannel]=useState<'whatsapp'|'email'>('whatsapp'),[code,setCode]=useState(''),[challenge,setChallenge]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[google,setGoogle]=useState(false);
 const [username,setUsername]=useState('');
 const [destination,setDestination]=useState('/portal'),[reset,setReset]=useState(false),[remaining,setRemaining]=useState(0);
 const next=params.get('next')||'';
 const safeNext=next.startsWith('/')&&!next.startsWith('//')&&!/[\\\r\n]/.test(next)?next:'';
 useEffect(()=>{fetch('/api/auth/options/').then(r=>r.json()).then(j=>setGoogle(j.google===true)).catch(()=>{});},[]);
 useEffect(()=>{if(!remaining)return;const id=setTimeout(()=>setRemaining(v=>v-1),1000);return()=>clearTimeout(id);},[remaining]);
 async function api(url:string,body:unknown){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Não foi possível continuar.');return j;}
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   if(mode==='password'){const j=await api('/api/auth/login/',{email:identifier,password});router.replace(safeNext||j.dest||'/portal');router.refresh();}
   else if(mode==='request'){const j=await api('/api/auth/code/request/',{identifier,channel});setChallenge(j.challengeId);setRemaining(60);setNotice(j.message);setMode('code');}
   else if(mode==='code'){const j=await api('/api/auth/code/verify/',{challengeId:challenge,code});setDestination(j.dest);if(reset){setPassword('');setMode('define');setNotice('Acesso confirmado. Agora escolha sua nova senha.');}else{router.replace(safeNext||j.dest||'/portal');router.refresh();}}
   else{if(username&&!params.get('token')){const r=await fetch('/api/auth/me/',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});const j=await r.json();if(!r.ok)throw new Error(j.error);}
    await api('/api/auth/password/',{password,...(params.get('token')?{token:params.get('token')}:{})});setNotice('Senha salva. Tudo pronto para entrar.');if(params.get('token')){setMode('password');setPassword('');}else{router.replace(safeNext||destination);router.refresh();}}
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível continuar.');}finally{setBusy(false);}
 }
 function change(nextMode:Mode){setMode(nextMode);setError('');setNotice('');setPassword('');setCode('');}
 const titles={password:'Bom ter você por aqui.',request:reset?'Vamos recuperar seu acesso.':'Entre com um código.',code:'Confira sua mensagem.',define:'Uma senha. Acesso simples.'};
 const descriptions={password:'Seus projetos, entregas e próximos passos em um só lugar.',request:'Use seu usuário ou e-mail. O código vai para o contato já cadastrado no KBOS.',code:`Digite os 6 números enviados por ${channel==='whatsapp'?'WhatsApp':'e-mail'}.`,define:'Escolha uma senha com pelo menos 8 caracteres.'};
 return <main className="kbos auth-page">
  <header className="auth-top"><Link href="/" aria-label="Kayque Brito — voltar ao site"><Image src="/logo-kayque.png" alt="Kayque Brito" width={150} height={58} priority className="h-9 w-auto brightness-0 invert"/></Link><span>KBOS · ESPAÇO DO CLIENTE</span></header>
  <div className="auth-layout">
   <aside className="auth-story"><span className="auth-kicker">CRIAÇÃO COM DIREÇÃO.</span><h2>Da primeira ideia<br/>ao próximo passo.</h2><p>Design, tecnologia e imagem, com um processo claro e uma conversa direta comigo.</p><div className="auth-orbits" aria-hidden="true"><span/><span/><span/></div><div className="auth-pillars"><span>Agilidade</span><span>Inovação</span><span>Inteligência</span></div><small>Kayque Brito · Criador & Explorador</small></aside>
   <section className="auth-card" aria-labelledby="login-title">
    <p className="auth-kicker">SEU ESPAÇO NO PROJETO</p><h1 id="login-title">{titles[mode]}</h1><p className="auth-description">{descriptions[mode]}</p>
    {(params.get('erro')==='google')&&<p className="auth-message" role="alert">Não foi possível entrar com Google. Use o e-mail já cadastrado, sua senha ou um código de acesso.</p>}
    {error&&<p className="auth-message auth-error" role="alert">{error}</p>}{notice&&<p className="auth-message" role="status">{notice}</p>}
    <form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="min-w-0 space-y-5">
     {(mode==='password'||mode==='request')&&<label className="kb-field">Usuário ou e-mail<input className="kb-control" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={160} value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Seu usuário ou e-mail cadastrado"/></label>}
     {(mode==='password'||mode==='define')&&<div><label className="kb-field" htmlFor="auth-password">{mode==='define'?'Nova senha':'Senha'}</label><div className="auth-password"><input id="auth-password" className="kb-control" required minLength={mode==='define'?8:1} maxLength={256} type={show?'text':'password'} autoComplete={mode==='define'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='define'?'Pelo menos 8 caracteres':'Sua senha'}/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(v=>!v)}>{show?'Ocultar':'Mostrar'}</button></div></div>}
     {mode==='define'&&!params.get('token')&&<label className="kb-field">Escolha seu usuário (opcional)<input className="kb-control" autoComplete="username" autoCapitalize="none" pattern="[a-z][a-z0-9._-]{2,29}" maxLength={30} value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="Ex.: meu.estudio"/><span className="text-xs kb-muted">Seu e-mail também continuará funcionando.</span></label>}
     {mode==='request'&&<div className="auth-channels" role="group" aria-label="Receber código por"><button type="button" aria-pressed={channel==='whatsapp'} onClick={()=>setChannel('whatsapp')}>WhatsApp</button><button type="button" aria-pressed={channel==='email'} onClick={()=>setChannel('email')}>E-mail</button></div>}
     {mode==='code'&&<label className="kb-field">Código de acesso<input className="kb-control auth-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000" autoFocus/></label>}
     <button type="submit" className="kb-btn w-full">{busy?'Aguarde…':mode==='password'?'Entrar no meu espaço':mode==='request'?'Receber código':mode==='code'?'Confirmar e continuar':'Salvar minha senha'}</button>
    </fieldset></form>
    {mode==='password'&&<><button type="button" className="auth-text-button" onClick={()=>{setReset(true);change('request');}}>Esqueci minha senha / primeiro acesso</button><div className="auth-divider"><span>ou</span></div><button type="button" className="kb-btn-ghost w-full" onClick={()=>{setReset(false);change('request');}}>Entrar com código pelo WhatsApp</button>{google&&<a className="kb-btn-ghost mt-3 w-full" href={`/api/auth/google/?next=${encodeURIComponent(safeNext)}`}><span className="font-bold" aria-hidden="true">G</span> Continuar com Google</a>}</>}
    {mode==='code'&&<button className="auth-text-button" disabled={remaining>0||busy} onClick={()=>change('request')}>{remaining>0?`Pode pedir outro código em ${remaining}s`:'Não recebi. Pedir outro código'}</button>}
    {mode!=='password'&&<button className="auth-text-button" disabled={busy} onClick={()=>change('password')}>← Voltar para usuário e senha</button>}
    <p className="auth-help">Acesso para clientes e equipe cadastrados. Não reconhece seu contato? <a href="https://wa.me/5591993743109" target="_blank" rel="noreferrer">Fale comigo.</a></p>
   </section>
  </div><footer className="auth-footer"><Link href="/">← Voltar ao site</Link><span>Feito para simplificar o que vem a seguir.</span></footer>
 </main>;
}
