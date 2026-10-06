import { KbosShell } from "@/components/kbos/Shell";
import PortalContent from "@/components/kbos/PortalContent";

export const metadata = { title: "Portal do Cliente — KBOS" };

export default function PortalPage() {
  return (
    <KbosShell title="Portal do Cliente">
      <PortalContent />
    </KbosShell>
  );
}
