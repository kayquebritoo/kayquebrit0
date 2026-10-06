import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  // Vercel: build completo (otimização de imagens, etc.)
  // Hostinger (deploy-hostinger.sh): export estático p/ hospedagem
  // compartilhada — gera `out/` com HTML/CSS/JS puros.
  ...(isVercel ? {} : { output: "export" as const }),
  trailingSlash: true,
  images: {
    // sem otimizador no servidor compartilhado: serve os arquivos
    // como estão (já são .webp leves)
    unoptimized: !isVercel,
    remotePatterns: [{ protocol: "https", hostname: "kayquebrito.com.br", pathname: "/wp-content/uploads/**" }],
  },
};

export default nextConfig;
