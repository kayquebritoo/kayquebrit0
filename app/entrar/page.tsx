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
  const user = await sessionUser();
  const { next, preview } = await searchParams;
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
