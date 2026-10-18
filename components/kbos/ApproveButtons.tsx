"use client";
import { useState } from "react";

export default function ApproveButtons({ projectId,fileId,status,onChange }: {projectId:string;fileId:string;status:string;onChange?:(status:string)=>void}){
 const [state,setState]=useState(status),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[feedback,setFeedback]=useState(''),[error,setError]=useState('');
 async function act(next:'aprovado'|'reprovado'){
  setBusy(true);setError('');
  try{
   const res=await fetch(`/api/projects/${projectId}/files/${fileId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next,...(next==='reprovado'?{feedback:feedback.trim()}:{})})});
   if(!res.ok)throw new Error('Não foi possível registrar. Tente novamente.');
   setState(next);setEditing(false);onChange?.(next);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar.');}finally{setBusy(false);}
 }
 return <div className="min-w-0 max-w-full space-y-3" aria-busy={busy}>
  {state!=='enviado'?<span role="status" className={`inline-flex min-h-10 items-center rounded-full px-3 text-xs ${state==='aprovado'?'bg-emerald-400/15 text-emerald-300':'bg-amber-400/15 text-amber-200'}`}>{state==='aprovado'?'✓ Aprovado':'Ajustes solicitados'}</span>:<>
   <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>act('aprovado')} className="kb-btn">{busy?'Salvando…':'Aprovar'}</button><button disabled={busy} aria-expanded={editing} onClick={()=>setEditing(v=>!v)} className="kb-btn-ghost">Pedir ajustes</button></div>
   {editing&&<form className="auth-form space-y-3" onSubmit={e=>{e.preventDefault();void act('reprovado');}}><label className="kb-field">O que podemos melhorar?<textarea className="kb-control" required minLength={3} maxLength={2000} rows={3} value={feedback} onChange={e=>setFeedback(e.target.value)} autoFocus placeholder="Conte o que você gostaria de ajustar."/></label><div className="flex flex-wrap gap-2"><button className="kb-btn" disabled={busy}>Enviar ajustes</button><button type="button" className="kb-btn-ghost" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button></div></form>}
  </>}
  {error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
 </div>;
}
