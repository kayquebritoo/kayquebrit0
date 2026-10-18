import { KbosShell } from "@/components/kbos/Shell";
import TasksBoard from "@/components/kbos/TasksBoard";

export const metadata = { title: "Tarefas — KBOS" };

export default function TarefasPage() {
  return (
    <KbosShell title="Tarefas e prazos" subtitle="Tudo que precisa ser feito, por data" admin>
      <TasksBoard />
    </KbosShell>
  );
}
