import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;
// STATIC_EXPORT=1 -> export estático p/ hospedagem compartilhada.
// Sem ele -> build server (Vercel/local) com as rotas /api/* do KBOS ativas.
// DOCKER_BUILD=1 -> `output: standalone` p/ a imagem Docker (tem precedência).
const isStatic = !!process.env.STATIC_EXPORT;
const isDocker = !!process.env.DOCKER_BUILD;

// Cabeçalhos de segurança. Sem CSP de scripts (o site usa estilos/scripts
// inline); só `frame-ancestors`/X-Frame-Options, que impedem outro site de
// embutir o KBOS num iframe e induzir cliques (aprovações, aceites).
// O `headers()` do config SOBRESCREVE o que a rota define: por isso CSP e
// Referrer-Policy ficam só nas páginas. As rotas de arquivo/token em /api
// mantêm as próprias (`sandbox; default-src 'none'`, `no-referrer`).
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // câmera (selfie da galeria) e microfone (busca por voz) só no próprio domínio
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
];
export const PAGE_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Export estático não aplica `headers()` (o Next avisa); só no build com servidor.
  ...(isStatic ? {} : {
    headers: async () => [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/:path((?!api/).*)", headers: PAGE_HEADERS },
    ],
  }),
  // 10 MB por arquivo + envelope multipart; o handler aplica o limite real.
  experimental: { proxyClientMaxBodySize: "12mb" },
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
