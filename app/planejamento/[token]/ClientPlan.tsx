"use client";
import { useEffect,useState } from "react";
import PlanView from "@/components/kbos/planning/PlanView";
import type { PublicClientPlan } from "@/lib/kbos/planning-model";
export default function ClientPlan({token}:{token:string}) {
 const [data,setData]=useState<PublicClientPlan|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetch(`/api/planning/${token}/`,{cache:'no-store'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);if(active)setData(j);}).catch(e=>{if(active)setError(e.message||'Não foi possível carregar o planejamento.');});return()=>{active=false;};},[token]);
 if(error)return <main className="kbos min-h-screen px-6 py-20"><div className="mx-auto max-w-lg"><h1 className="text-2xl font-semibold">Planejamento indisponível</h1><p role="alert" className="mt-4">{error}</p></div></main>;
 if(!data)return <main className="kbos min-h-screen p-8" role="status">Preparando seu espaço de marca…</main>;
 return <PlanView data={data} assetUrl={(id,preview)=>`/api/planning/${token}/files/${id}/${preview?'?preview=1':''}`} onReview={async body=>{const r=await fetch(`/api/planning/${token}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j);}} />;
}
