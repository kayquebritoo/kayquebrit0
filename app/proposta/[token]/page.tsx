import Proposal from "./Proposal";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Proposta — Kayque Brito", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Proposal token={(await params).token} />;
}
