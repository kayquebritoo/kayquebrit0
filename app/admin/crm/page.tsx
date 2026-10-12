import { KbosShell } from "@/components/kbos/Shell";
import CrmBoard from "@/components/kbos/CrmBoard";

export const metadata = { title: "CRM — KBOS" };

export default function CrmPage() {
  return (
    <KbosShell title="CRM" subtitle="Leads, clientes e parceiros" admin>
      <CrmBoard />
    </KbosShell>
  );
}
