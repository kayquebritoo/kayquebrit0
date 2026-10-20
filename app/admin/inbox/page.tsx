import { KbosShell } from "@/components/kbos/Shell";
import InboxBoard from "@/components/kbos/InboxBoard";
import Link from "next/link";

export const metadata = { title: "Inbox — KBOS" };

export default function InboxPage() {
  return (
    <KbosShell title="Inbox" subtitle="Todas as conversas em um só lugar" admin>
      <p className="kb-faint mb-2 text-right text-xs"><Link href="/admin/ajustes" className="underline-offset-4 hover:underline">Conexões ⚙</Link></p>
      <InboxBoard />
    </KbosShell>
  );
}
