import { KbosShell } from "@/components/kbos/Shell";
import AgendaBoard from "@/components/kbos/AgendaBoard";

export const metadata = { title: "Agenda — KBOS" };

export default function AgendaPage() {
  return (
    <KbosShell title="Agenda" subtitle="Compromissos com alerta via WhatsApp" admin>
      <AgendaBoard />
    </KbosShell>
  );
}
