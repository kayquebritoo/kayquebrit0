import { KbosShell } from "@/components/kbos/Shell";
import KanbanBoard from "./KanbanBoard";

export const metadata = { title: "Projetos — KBOS" };

export default function ProjetosPage() {
  return (
    <KbosShell title="Projetos">
      <KanbanBoard />
    </KbosShell>
  );
}
