import type { Metadata, Viewport } from "next";
import Consent from "./Consent";

export const metadata: Metadata = { title: "Autorização — Kayque Brito", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Consent token={(await params).token} />;
}
