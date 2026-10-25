import type { Metadata, Viewport } from "next";
import PageBackdrop from "@/components/PageBackdrop";
import SocialConnectPanel from "@/components/kbos/social/SocialConnectPanel";
import ConnectHeader from "./ConnectHeader";

export const metadata: Metadata = { title: "Conectar redes sociais — Kayque Brito", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

// Link de conexão mandado pelo WhatsApp: o cliente conecta as redes sem precisar de senha do KBOS.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="kbos relative isolate min-h-screen overflow-hidden px-4 pb-20 pt-14 sm:px-6">
      <PageBackdrop />
      <div className="kb-stagger relative z-10 mx-auto flex max-w-xl flex-col gap-5">
        <ConnectHeader token={token} />
        <SocialConnectPanel token={token} />
        <p className="kb-faint text-center text-xs">Kayque Brito · KBOS — publicação dos seus conteúdos.</p>
      </div>
    </main>
  );
}
