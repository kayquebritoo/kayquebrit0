import { KbosShell } from "@/components/kbos/Shell";
import ContentBoard from "@/components/kbos/ContentBoard";

export const metadata = { title: "Conteúdo · KBOS" };

export default function ConteudoPage() {
  return (
    <KbosShell title="Conteúdo e posts" admin>
      <ContentBoard />
    </KbosShell>
  );
}
