import { KbosShell } from "@/components/kbos/Shell";
import Today from "@/components/kbos/Today";

export const metadata = { title: "Hoje — KBOS" };

export default function AdminPage() {
  return (
    <KbosShell title="Hoje" admin>
      <Today />
    </KbosShell>
  );
}
