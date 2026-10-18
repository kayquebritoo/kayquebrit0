import { KbosShell } from "@/components/kbos/Shell";
import Relatorios from "./Relatorios";

export const metadata = { title: "Relatórios — KBOS" };

export default function RelatoriosPage() {
  return (
    <KbosShell title="Relatórios" admin>
      <Relatorios />
    </KbosShell>
  );
}
