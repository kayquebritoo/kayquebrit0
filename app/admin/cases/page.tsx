import { KbosShell } from "@/components/kbos/Shell";
import CasesBoard from "@/components/kbos/CasesBoard";

export const metadata = { title: "Cases — KBOS" };

export default function CasesPage() {
  return (
    <KbosShell title="Cases" subtitle="Portfólio com autorização do cliente" admin>
      <CasesBoard />
    </KbosShell>
  );
}
