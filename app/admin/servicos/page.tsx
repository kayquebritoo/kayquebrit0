import { KbosShell } from "@/components/kbos/Shell";
import ServicesBoard from "@/components/kbos/ServicesBoard";

export const metadata = { title: "Serviços e valores — KBOS" };

export default function ServicosPage() {
  return (
    <KbosShell title="Serviços e valores" subtitle="Valor, prazo e o que está incluso" admin>
      <ServicesBoard />
    </KbosShell>
  );
}
