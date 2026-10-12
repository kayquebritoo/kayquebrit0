import { KbosShell } from "@/components/kbos/Shell";
import CampaignsBoard from "@/components/kbos/CampaignsBoard";

export const metadata = { title: "Campanhas — KBOS" };

export default function CampaignsPage() {
  return (
    <KbosShell title="Campanhas" subtitle="Disparos em massa via worker + Evolution" admin>
      <CampaignsBoard />
    </KbosShell>
  );
}
