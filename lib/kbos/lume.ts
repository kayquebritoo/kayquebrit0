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

/** Link `/entrar?e=<expira>&s=<hmac>` aceito pelo servidor do Lume (mesma regra de `entrada_valida` no Python). */
export function lumeEntryUrl(base: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const exp = nowSec + 120;
  const s = createHmac("sha256", secret).update(`entrar:${exp}`).digest("hex");
  return `${base.replace(/\/+$/, "")}/entrar?e=${exp}&s=${s}`;
}
