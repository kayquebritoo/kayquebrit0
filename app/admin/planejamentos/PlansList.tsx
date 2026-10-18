"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
type Item={id:string;title:string;status:string;version:number;updatedAt:string};
export default function PlansList(){
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{fetch('/api/plans/',{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);setItems(j.items||[]);}).catch(e=>setError(e.message)).finally(()=>setLoaded(true));},[]);
 return <div className="space-y-6"><div className="kb-glass p-5"><h2 className="text-xl font-semibold">Cada aceite abre um espaço para a marca.</h2><p className="my-3 kb-muted">Revise os dados enviados, construa a estratégia e publique uma versão para o cliente validar. Rascunhos ficam preservados na área da equipe.</p><Link href="/admin/planejamentos/preview/" className="kb-btn-ghost">Ver demonstração no celular e desktop →</Link></div>{error&&<p role="alert">{error}</p>}{!loaded&&<p>Carregando planejamentos…</p>}<div className="grid gap-4 md:grid-cols-2">{items.map(p=><Link className="kb-glass p-5" href={`/admin/planejamentos/${p.id}/`} key={p.id}><span className="kb-tag">{{draft:'Em preparação',review:'Aguardando cliente',changes:'Ajustes solicitados',approved:'Aprovado'}[p.status]||p.status}</span><h3 className="my-3 text-lg font-semibold">{p.title}</h3><p className="text-sm kb-muted">{p.version?`Versão publicada ${p.version}`:'Nenhuma versão publicada'} · Abrir editor →</p></Link>)}</div>{loaded&&!items.length&&!error&&<p className="kb-glass p-6">Os próximos aceites de orçamento aparecerão aqui automaticamente.</p>}</div>;
}
