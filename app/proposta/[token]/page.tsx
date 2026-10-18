import Proposal from "./Proposal";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "Proposta — Kayque Brito", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Proposal token={(await params).token} />;
}
