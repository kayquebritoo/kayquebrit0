import { redirect } from "next/navigation";
import AccessLinkEntry from "@/components/kbos/AccessLinkEntry";

export const metadata = { title: "Seu acesso — KBOS · Kayque Brito", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };

// Link de acesso enviado pelo Kayque (/entrar/link/#token). A sessão vive na VPS;
// o navegador mantém o fragmento (#token) através do redirect.
export default function AccessLinkPage() {
  if (process.env.VERCEL) redirect("https://kbos.kayquebrito.com.br/entrar/link/");
  return <AccessLinkEntry />;
}
