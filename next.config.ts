import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;
// STATIC_EXPORT=1 -> export estático p/ hospedagem compartilhada.
// Sem ele -> build server (Vercel/local) com as rotas /api/* do KBOS ativas.
// DOCKER_BUILD=1 -> `output: standalone` p/ a imagem Docker (tem precedência).
const isStatic = !!process.env.STATIC_EXPORT;
const isDocker = !!process.env.DOCKER_BUILD;

const nextConfig: NextConfig = {
  // Vercel: build completo (otimização de imagens, etc.)
  // Hostinger (deploy-hostinger.sh): export estático p/ hospedagem
  // compartilhada — gera `out/` com HTML/CSS/JS puros.
  // Docker (Dockerfile): standalone p/ `node server.js`.
  ...(isDocker ? { output: "standalone" as const } : isStatic ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: {
    // sem otimizador no servidor compartilhado: serve os arquivos
    // como estão (já são .webp leves)
    unoptimized: !isVercel,
    remotePatterns: [{ protocol: "https", hostname: "kayquebrito.com.br", pathname: "/wp-content/uploads/**" }],
  },
};

export default nextConfig;
