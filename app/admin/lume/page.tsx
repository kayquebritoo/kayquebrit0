import { KbosShell } from "@/components/kbos/Shell";
import Lume from "./Lume";

export const metadata = { title: "Lume · acervo inteligente — KBOS" };

export default function LumePage() {
  return (
    <KbosShell title="Lume · acervo" admin>
      <Lume />
    </KbosShell>
  );
}
