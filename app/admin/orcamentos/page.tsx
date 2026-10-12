import { KbosShell } from "@/components/kbos/Shell";
import Orcamentos from "./Orcamentos";

export const metadata = { title: "Orçamentos — KBOS" };

export default function OrcamentosPage() {
  return (
    <KbosShell title="Orçamentos" subtitle="Propostas comerciais em PDF" admin>
      <Orcamentos />
    </KbosShell>
  );
}
