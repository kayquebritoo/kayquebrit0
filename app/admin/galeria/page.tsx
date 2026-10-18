import { KbosShell } from "@/components/kbos/Shell";
import Galeria from "./Galeria";

export const metadata = { title: "Galeria do cliente — KBOS" };

export default function GaleriaPage() {
  return (
    <KbosShell title="Galeria do cliente" admin>
      <Galeria />
    </KbosShell>
  );
}
