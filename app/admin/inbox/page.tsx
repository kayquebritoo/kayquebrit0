import { KbosShell } from "@/components/kbos/Shell";
import InboxBoard from "@/components/kbos/InboxBoard";
import InboxChannels from "@/components/kbos/InboxChannels";

export const metadata = { title: "Inbox — KBOS" };

export default function InboxPage() {
  return (
    <KbosShell title="Inbox" subtitle="Todas as conversas em um só lugar" admin>
      <InboxChannels />
      <InboxBoard />
    </KbosShell>
  );
}
