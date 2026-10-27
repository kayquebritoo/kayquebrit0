import type { Metadata } from "next";
import PortalPreview from "@/components/kbos/portal-preview/PortalPreview";

export const metadata: Metadata = { title: "Prévia do portal — KBOS", robots: { index: false, follow: false } };

// Protótipo do portal por empresa e módulos, com dados fictícios (Fase 3 da auditoria do portal).
export default function PortalPreviewPage() {
  return <PortalPreview />;
}
