import { KbosShell } from "@/components/kbos/Shell";
import BriefingsList from "./BriefingsList";

export const metadata = { title: "Briefings — KBOS" };

export default function BriefingsPage() {
  return (
    <KbosShell title="Briefings" admin>
      <BriefingsList />
    </KbosShell>
  );
}
