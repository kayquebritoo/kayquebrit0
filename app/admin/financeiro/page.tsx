import { KbosShell } from "@/components/kbos/Shell";
import Financeiro from "./Financeiro";

export const metadata = { title: "Financeiro — KBOS" };

export default function FinanceiroPage() {
  return (
    <KbosShell title="Financeiro" admin>
      <Financeiro />
    </KbosShell>
  );
}
