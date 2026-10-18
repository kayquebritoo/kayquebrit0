import { KbosShell } from "@/components/kbos/Shell";
import AccountAccess from "./AccountAccess";
export const metadata={title:'Meu acesso — KBOS'};
export default function Page(){return <KbosShell title="Meu acesso" subtitle="Escolha como você prefere entrar"><AccountAccess/></KbosShell>;}
