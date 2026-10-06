// Baixa mídias em alta resolução do WordPress original para /public.
// Uso: npm run assets:fetch
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://kayquebrito.com.br/wp-content/uploads";
const OUT = path.join(process.cwd(), "public");

const FILES = [
  // hero
  ["2026/03/kayque.png", "assets/hero/kayque.png"],
  // portfolio
  ["2026/03/manafest-capa.webp", "assets/portfolio/manafest-capa.webp"],
  ["2026/03/klau-amaral-capa-2.webp", "assets/portfolio/klau-amaral-capa-2.webp"],
  ["2026/03/passo-capa.webp", "assets/portfolio/passo-capa.webp"],
  ["2026/03/PLUGBRA-CAPA-1.webp", "assets/portfolio/PLUGBRA-CAPA-1.webp"],
  ["2026/03/parasuperfoods-capa.webp", "assets/portfolio/parasuperfoods-capa.webp"],
  ["2026/03/comitiva-yovekene-capa.webp", "assets/portfolio/comitiva-yovekene-capa.webp"],
  ["2026/03/acai-norte-mix-capa.webp", "assets/portfolio/acai-norte-mix-capa.webp"],
  // parceiros
  ["2026/03/direcionare-logo.webp", "assets/partners/direcionare-logo.webp"],
  ["2026/03/acainortemix-logo.webp", "assets/partners/acainortemix-logo.webp"],
  ["2026/03/atalaiavip-logo.webp", "assets/partners/atalaiavip-logo.webp"],
  ["2026/03/inexo-logo.webp", "assets/partners/inexo-logo.webp"],
  // deco
  ["2026/03/ok1.webp", "assets/deco/ok1.webp"],
  ["2026/03/ok2.webp", "assets/deco/ok2.webp"],
  ["2026/03/ok3.webp", "assets/deco/ok3.webp"],
  ["2026/03/ok4.webp", "assets/deco/ok4.webp"],
  ["2026/03/21Ativo-1.webp", "assets/deco/21Ativo-1.webp"],
  ["2026/03/21Ativo-3.webp", "assets/deco/21Ativo-3.webp"],
  // fontes Cottorway Pro (reais do Elementor Kit 10)
  ["2026/03/CottorwayPro-Bold.woff", "fonts/CottorwayPro-Bold.woff"],
  ["2026/03/CottorwayPro-Light.woff", "fonts/CottorwayPro-Light.woff"],
  ["2026/03/CottorwayItalics-Bold.woff", "fonts/CottorwayItalics-Bold.woff"],
  ["2026/03/CottorwayItalics-Light.woff", "fonts/CottorwayItalics-Light.woff"],
  // favicon
  ["2026/03/cropped-21Ativo-4-32x32.webp", "favicon.webp"],
];

for (const [src, dest] of FILES) {
  const url = `${BASE}/${src}`;
  const outPath = path.join(OUT, dest);
  await mkdir(path.dirname(outPath), { recursive: true });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, buf);
    console.log(`ok ${dest} (${(buf.length / 1024).toFixed(1)}kb)`);
  } catch (e) {
    console.warn(`falhou ${url}: ${e}`);
  }
}
console.log("done. Converta PNG grandes para WebP/AVIF se necessário.");
