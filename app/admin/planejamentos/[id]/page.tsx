import { KbosShell } from "@/components/kbos/Shell";
import PlanEditor from "./PlanEditor";
export const metadata={title:'Editar marca e planejamento — KBOS'};
export default async function Page({params}:{params:Promise<{id:string}>}){return <KbosShell title="Marca e planejamento" subtitle="Rascunho da equipe e versões validadas pelo cliente" admin><PlanEditor id={(await params).id}/></KbosShell>;}
