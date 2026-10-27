import { KbosShell } from "@/components/kbos/Shell";
import CompaniesBoard from "@/components/kbos/CompaniesBoard";

export const metadata = { title: "Empresas e acessos — KBOS" };

export default function EmpresasPage() {
  return (
    <KbosShell title="Empresas e acessos" subtitle="Quem do cliente vê o quê no portal" admin>
      <CompaniesBoard />
    </KbosShell>
  );
}
