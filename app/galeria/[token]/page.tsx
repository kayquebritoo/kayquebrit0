import type { Metadata, Viewport } from "next";
import Gallery from "./Gallery";

export const metadata: Metadata = { title: "Suas fotos — Kayque Brito", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Gallery token={(await params).token} />;
}
