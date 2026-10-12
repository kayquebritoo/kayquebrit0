import { KbosShell } from "@/components/kbos/Shell";
import DealsKanban from "@/components/kbos/DealsKanban";

export const metadata = { title: "Kanban de vendas — KBOS" };

export default function KanbanVendasPage() {
  return (
    <KbosShell title="Kanban de vendas" subtitle="Prospecção → ganho · arraste ou use as setas" admin>
      <DealsKanban />
    </KbosShell>
  );
}
