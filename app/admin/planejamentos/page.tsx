import { KbosShell } from "@/components/kbos/Shell";
import PlansList from "./PlansList";
export const metadata={title:'Marcas e planejamentos — KBOS'};
export default function Page(){return <KbosShell title="Marcas e planejamentos" subtitle="Do aceite à direção criativa validada pelo cliente" admin><PlansList/></KbosShell>;}
