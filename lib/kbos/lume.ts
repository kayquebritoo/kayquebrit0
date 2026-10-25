// Lume — acervo inteligente (ferramenta interna local). Regras puras, sem rede.
// O KBOS NÃO hospeda nem acessa o Lume: o endereço fica só no navegador de quem usa
// e é aberto no computador dessa pessoa. Por isso só aceitamos endereços locais/da rede privada.

export const LUME_STORAGE_KEY = "kbos.lume.endpoint";
export const LUME_DEFAULT_ENDPOINT = "http://127.0.0.1:8765";

export type LumeEndpoint = { ok: true; url: string; kind: "este-computador" | "rede-local" } | { ok: false; error: string };

const privateV4 = (h: string): boolean => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

export function parseLumeEndpoint(input: string): LumeEndpoint {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Digite o endereço do Lume, por exemplo http://127.0.0.1:8765." };
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`); }
  catch { return { ok: false, error: "Endereço inválido." }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Use um endereço http ou https." };
  if (url.username || url.password) return { ok: false, error: "Não coloque usuário ou senha no endereço." };
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
  const lan = privateV4(host) || host.endsWith(".local");
  if (!loopback && !lan) return { ok: false, error: "O Lume roda no seu computador: use localhost, 127.0.0.1 ou um IP da sua rede (192.168.x.x, 10.x.x.x)." };
  return { ok: true, url: url.origin, kind: loopback ? "este-computador" : "rede-local" };
}

// ── Lume online (VPS própria) ────────────────────────────────────────────────
// O KBOS só assina um link de entrada de 2 minutos; o Lume confere a assinatura e abre a própria sessão.
import { createHmac } from "node:crypto";

export const LUME_ONLINE_DEFAULT = "https://lume.kayquebrito.com.br";

/** Só caminhos internos do Lume (começam com "/", sem "//" nem barra invertida): evita redirecionar para fora. */
export function safeLumePath(ir: string | null | undefined): string | null {
  if (!ir || ir.length > 300 || !ir.startsWith("/") || ir.startsWith("//") || ir.includes("\\")) return null;
  return ir;
}

/** Link `/entrar?e=<expira>&s=<hmac>` aceito pelo servidor do Lume (mesma regra de `entrada_valida` no Python). `ir` = página de destino dentro do Lume. */
export function lumeEntryUrl(base: string, secret: string, nowSec = Math.floor(Date.now() / 1000), ir?: string | null): string {
  const exp = nowSec + 120;
  const s = createHmac("sha256", secret).update(`entrar:${exp}`).digest("hex");
  const dest = safeLumePath(ir);
  return `${base.replace(/\/+$/, "")}/entrar?e=${exp}&s=${s}${dest ? `&ir=${encodeURIComponent(dest)}` : ""}`;
}

/** Entrada do CLIENTE (portal): mesma assinatura, mas presa a uma pasta (`cliente:<exp>:<pasta>`, igual ao Python). Só leitura. */
export function lumeClientEntryUrl(base: string, secret: string, pasta: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + 120;
  const s = createHmac("sha256", secret).update(`cliente:${exp}:${pasta}`).digest("hex");
  return `${base.replace(/\/+$/, "")}/entrar-cliente?e=${exp}&esc=${encodeURIComponent(pasta)}&s=${s}`;
}

/** Página do Lume já filtrada por pasta/empresa (ex.: "Hotel"). */
export const lumePastaPath = (pasta?: string | null) => (pasta ? `/?p=${encodeURIComponent(pasta)}` : "/");

// ── App instalado (iPhone/Android): código de 8 letras gerado aqui e digitado no app ─────────────────────────
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Mesma regra de `codigo_pareamento` no Python: vale na janela de 10 min em que foi gerado e na seguinte. */
export function lumePairCode(secret: string, nowSec = Math.floor(Date.now() / 1000)): { code: string; expiresAt: number } {
  const j = Math.floor(nowSec / 600);
  const d = createHmac("sha256", secret).update(`pareamento:${j}`).digest();
  const code = Array.from(d.subarray(0, 8), (b) => ALFA[b % ALFA.length]).join("");
  return { code, expiresAt: (j + 2) * 600 };
}

// ── Takes para o calendário: o KBOS fala com o Lume COMO o cliente ─────────────────────────────
// Mesmo cookie que o Lume cria em /entrar-cliente (`sessao_cliente` no Python): `<exp>.<b64url(pasta)>.<hmac("cliente:<exp>:<pasta>")>`.
// Assim o próprio Lume força a pasta da empresa; o KBOS nunca usa a chave de admin em nome do cliente.
export function lumeClientCookie(secret: string, pasta: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + 300;
  const b64 = Buffer.from(pasta, "utf8").toString("base64url");
  return `lume_c=${exp}.${b64}.${createHmac("sha256", secret).update(`cliente:${exp}:${pasta}`).digest("hex")}`;
}

export type LumeTake = { id: number; nome: string; tipo: string; segundo: number | null; data: string | null; caminho?: string };

/** Resultado do Lume (`/buscar` ou `/catalogo`) → takes. O caminho serve só para filtrar no servidor; não vai para o navegador. */
export function toTakes(json: unknown): LumeTake[] {
  const list = (json && typeof json === "object" && Array.isArray((json as { resultados?: unknown[] }).resultados) ? (json as { resultados: unknown[] }).resultados : []) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: LumeTake[] = [];
  for (const r of list) {
    const id = Number(r.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const nome = String(r.nome || String(r.caminho || "").split("/").pop() || `Take ${id}`).slice(0, 200);
    const segundo = typeof r.segundo === "number" && Number.isFinite(r.segundo) ? r.segundo : null;
    const key = `${nome}:${segundo === null ? "" : Math.round(segundo)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, nome, tipo: String(r.tipo || ""), segundo, data: typeof r.data === "string" ? r.data : null, caminho: String(r.caminho || "") });
  }
  return out.slice(0, 60);
}
