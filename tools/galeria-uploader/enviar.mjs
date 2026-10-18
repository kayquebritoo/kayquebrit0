#!/usr/bin/env node
// Uso (no Mac):
//   cd tools/galeria-uploader && npm install
//   export GALLERY_INGEST_TOKEN="<o mesmo token configurado na VPS>"
//   node enviar.mjs --album <id-do-album> --pasta "/caminho/das/fotos" --logo "/caminho/logo.png" [--servidor https://kbos.kayquebrito.com.br] [--texto "Atalaia Vip"]
// Reenvio é seguro: o que já subiu fica em .galeria-enviadas.json dentro da pasta e é pulado.
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []));
const server = (args.servidor || "https://kbos.kayquebrito.com.br").replace(/\/$/, "");
const token = process.env.GALLERY_INGEST_TOKEN || "";
const { album, pasta, logo, texto } = args;
if (!album || !pasta || !token) {
  console.error("Faltou --album, --pasta ou a variável GALLERY_INGEST_TOKEN. Veja o topo deste arquivo.");
  process.exit(1);
}

const stateFile = join(pasta, ".galeria-enviadas.json");
const done = new Set(existsSync(stateFile) ? JSON.parse(await readFile(stateFile, "utf8")) : []);

async function watermark(width) {
  const w = Math.round(width * 0.16);
  if (logo && existsSync(logo)) {
    const png = await sharp(logo).resize({ width: w }).ensureAlpha().png().toBuffer();
    return png;
  }
  const label = (texto || "Atalaia Vip").replace(/[<>&]/g, "");
  const fs = Math.round(width * 0.028);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${fs * 2}"><text x="${w * 2}" y="${fs * 1.5}" text-anchor="end" font-family="Helvetica, Arial" font-size="${fs}" font-weight="700" fill="white" fill-opacity="0.8" stroke="black" stroke-opacity="0.35" stroke-width="1">${label}</text></svg>`);
}

async function version(buf, longSide, quality, mark) {
  const base = sharp(buf).rotate().resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  if (!mark) return { data, info };
  const m = await watermark(info.width);
  const mm = await sharp(m).metadata();
  const pad = Math.round(info.width * 0.025);
  const left = Math.max(0, info.width - (mm.width || 0) - pad);
  const top = Math.max(0, info.height - (mm.height || 0) - pad);
  const out = await sharp(data).composite([{ input: m, left, top }]).jpeg({ quality, mozjpeg: true }).toBuffer();
  return { data: out, info };
}

async function enviar(file) {
  const buf = await readFile(join(pasta, file));
  const when = (await stat(join(pasta, file))).mtime;
  const thumb = await version(buf, 520, 72, false);
  const preview = await version(buf, 1600, 78, true);
  const download = await version(buf, 2400, 86, true);
  const fd = new FormData();
  fd.set("name", basename(file));
  fd.set("width", String(download.info.width));
  fd.set("height", String(download.info.height));
  fd.set("takenAt", when.toISOString());
  fd.set("thumb", new Blob([thumb.data], { type: "image/jpeg" }), "thumb.jpg");
  fd.set("preview", new Blob([preview.data], { type: "image/jpeg" }), "preview.jpg");
  fd.set("download", new Blob([download.data], { type: "image/jpeg" }), "download.jpg");
  const r = await fetch(`${server}/api/admin/gallery/albums/${album}/photos/`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
}

const files = (await readdir(pasta)).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(extname(f) || "") && !f.startsWith(".") && !done.has(f)).sort();
console.log(`${files.length} foto(s) para enviar (${done.size} já enviadas antes).`);
let ok = 0, falhas = 0, i = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++];
    try { await enviar(f); done.add(f); ok++; await writeFile(stateFile, JSON.stringify([...done])); console.log(`✓ ${f} (${ok}/${files.length})`); }
    catch (e) { falhas++; console.error(`✗ ${f}: ${e.message}`); }
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`Pronto: ${ok} enviadas, ${falhas} com erro.${falhas ? " Rode de novo para tentar as que falharam." : ""}`);
