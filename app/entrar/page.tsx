import { Suspense } from "react";
import { redirect } from "next/navigation";
import EntrarForm from "@/components/kbos/EntrarForm";
import { sessionUser } from "@/lib/kbos/rbac";

export const metadata = { title: "Seu espaço — KBOS · Kayque Brito", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

// Sessão válida (cookie) ou bypass aberto da VPS → vai direto ao painel,
// sem exibir o login desnecessariamente. `next` é saneado (só path interno).
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; preview?: string }>;
}) {
  const { next, preview } = await searchParams;
  // O motor de WhatsApp e a sessão principal estão na VPS. O portfólio
  // da Vercel encaminha o login para lá, evitando dois acessos diferentes.
  if (process.env.VERCEL) {
    const url = new URL("https://kbos.kayquebrito.com.br/entrar/");
    if (next?.startsWith("/") && !next.startsWith("//") && !/[\\\r\n]/.test(next)) url.searchParams.set("next", next);
    if (preview === "1") url.searchParams.set("preview", "1");
    redirect(url.toString());
  }
  const user = await sessionUser();
  if (user && !(preview === "1" && user.role === "admin")) {
    redirect(
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : user.role === "admin"
          ? "/admin"
          : "/portal"
    );
  }
  return (
    <Suspense fallback={null}>
      <EntrarForm />
    </Suspense>
  );
}
