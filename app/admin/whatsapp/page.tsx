import { KbosShell } from "@/components/kbos/Shell";
import WhatsappConnect from "@/components/kbos/WhatsappConnect";

export const metadata = { title: "WhatsApp — KBOS Admin" };

export default function AdminWhatsappPage() {
  return (
    <KbosShell title="WhatsApp" admin>
      <WhatsappConnect />
    </KbosShell>
  );
}
