import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Manifesto PWA por domínio: instalado a partir de kbos.kayquebrito.com.br
// vira o app "KBOS" que abre direto no painel; no domínio do portfólio
// segue o app do site. Cores do painel (#11101E) para a splash nativa.
// Instalar o app de um domínio e navegar para o outro faz o iPhone mostrar
// a barra do Safari (fora do escopo) — por isso cada domínio tem o seu.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = ((await headers()).get("x-forwarded-host") || (await headers()).get("host") || "").toLowerCase();
  const kbos = host.startsWith("kbos.");
  const icons: MetadataRoute.Manifest["icons"] = [
    { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
  ];
  return {
    id: kbos ? "/admin/" : "/",
    name: kbos ? "KBOS" : "Kayque Brito",
    short_name: kbos ? "KBOS" : "Kayque Brito",
    description: kbos
      ? "KBOS — tarefas, clientes, inbox e financeiro do estúdio."
      : "Kayque Brito — design, vídeo, foto e software.",
    start_url: kbos ? "/entrar/" : "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#11101E",
    theme_color: "#11101E",
    lang: "pt-BR",
    icons,
  };
}
