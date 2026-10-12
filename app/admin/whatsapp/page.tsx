import Link from "next/link";
import { KbosShell } from "@/components/kbos/Shell";
import WhatsappConnect from "@/components/kbos/WhatsappConnect";

export const metadata = { title: "WhatsApp — KBOS Admin" };

export default function AdminWhatsappPage() {
  return (
    <KbosShell title="WhatsApp" subtitle="Conexão Evolution API" admin>
      <Link
        href="/admin/inbox"
        className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
      >
        <span>✉ As mensagens que chegam aqui caem no <strong>Inbox unificado</strong>.</span>
        <span className="shrink-0">Abrir inbox →</span>
      </Link>
      <WhatsappConnect />
    </KbosShell>
  );
}
