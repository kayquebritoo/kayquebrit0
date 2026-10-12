import { Suspense } from "react";
import { redirect } from "next/navigation";
import EntrarForm from "@/components/kbos/EntrarForm";
import { sessionUser } from "@/lib/kbos/rbac";

export const metadata = { title: "Entrar — KBOS" };

// Sessão válida (cookie) ou bypass aberto da VPS → vai direto ao painel,
// sem exibir o login desnecessariamente. `next` é saneado (só path interno).
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await sessionUser();
  if (user) {
    const { next } = await searchParams;
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
