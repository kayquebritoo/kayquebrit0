import type { MetadataRoute } from "next";

// Manifesto PWA: cores do painel (#0B0B1E) para o SO pintar a abertura
// (splash nativa) no mesmo tom antes mesmo do JS carregar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KBOS — Kayque Brito",
    short_name: "KBOS",
    description:
      "KBOS — gestão de projetos, CRM, inbox e financeiro. Portal do cliente e admin.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B1E",
    theme_color: "#0B0B1E",
    lang: "pt-BR",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
