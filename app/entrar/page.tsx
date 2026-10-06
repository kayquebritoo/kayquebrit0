import { Suspense } from "react";
import EntrarForm from "@/components/kbos/EntrarForm";

export const metadata = { title: "Entrar — KBOS" };

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarForm />
    </Suspense>
  );
}
