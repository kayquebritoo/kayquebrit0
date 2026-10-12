import { KbosShell } from "@/components/kbos/Shell";
import KanbanBoard from "./KanbanBoard";
import ShowcaseManager from "@/components/kbos/ShowcaseManager";

export const metadata = { title: "Projetos — KBOS" };

export default function ProjetosPage() {
  return (
    <KbosShell title="Projetos" subtitle="Pipeline operacional + vitrine e cursos">
      <KanbanBoard />
      <ShowcaseManager />
    </KbosShell>
  );
}
