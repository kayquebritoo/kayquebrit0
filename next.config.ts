import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // export estático p/ hospedagem compartilhada (sem Node no servidor):
  // gera `out/` com HTML/CSS/JS puros — basta enviar via FTP/rsync.
  output: "export",
  trailingSlash: true,
  images: {
    // sem otimizador no servidor: serve os arquivos como estão (já são .webp leves)
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "kayquebrito.com.br", pathname: "/wp-content/uploads/**" }],
  },
};

export default nextConfig;
