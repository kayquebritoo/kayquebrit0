import { KbosShell } from "@/components/kbos/Shell";
import AdminDash from "@/components/kbos/AdminDash";

export const metadata = { title: "Admin — KBOS" };

export default function AdminPage() {
  return (
    <KbosShell title="Painel KBOS" admin>
      <AdminDash />
    </KbosShell>
  );
}
