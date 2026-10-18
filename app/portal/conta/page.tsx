import { KbosShell } from "@/components/kbos/Shell";
import AccountAccess from "./AccountAccess";
export const metadata={title:'Meu acesso — KBOS'};
export default async function Page({searchParams}:{searchParams:Promise<{google?:string}>}){const {google}=await searchParams;return <KbosShell title="Meu acesso" subtitle="Escolha como você prefere entrar"><AccountAccess googleError={google==='error'}/></KbosShell>;}
