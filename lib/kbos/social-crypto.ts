// Tokens das redes sociais no banco: sempre criptografados (AES-256-GCM).
// v2 = chave própria `SOCIAL_TOKEN_KEY` (gerada pelo menu de configuração; não muda quando o segredo de uma rede muda).
// v1 = legado, chave derivada do segredo do app da Meta (só para abrir o que já foi gravado assim).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const derive = (label: string, secret: string) => createHash("sha256").update(`${label}:${secret}`).digest();
const ownKey = () => (process.env.SOCIAL_TOKEN_KEY || "").trim();
const metaSecret = () => process.env.META_APP_SECRET || "";

/** Há chave para guardar tokens? Sem ela nenhuma rede pode ser conectada. */
export const socialCryptoReady = () => ownKey().length >= 32 || metaSecret().length >= 16;

function keyFor(version: "v1" | "v2", secret?: string) {
  if (version === "v1") {
    const s = secret ?? metaSecret();
    if (s.length < 16) throw new Error("META_APP_SECRET não configurado.");
    return derive("kbos-social-token", s);
  }
  const k = secret ?? ownKey();
  if (k.length < 32) throw new Error("SOCIAL_TOKEN_KEY não configurada (rode o menu de configuração).");
  return derive("kbos-social-token-v2", k);
}

/** `secret` só nos testes: força a chave (com 32+ caracteres vira v2, senão v1). */
export function seal(plain: string, secret?: string) {
  const version = (secret ?? ownKey()).length >= 32 ? "v2" : "v1";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(version, secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${version}.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function unseal(sealed: string, secret?: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if ((v !== "v1" && v !== "v2") || !iv || !tag || !body) throw new Error("Token em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", keyFor(v, secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** HMAC para assinar `state` e tokens de link (mesma chave dos tokens, rótulo próprio). */
export function socialSign(label: string, value: string) {
  const k = ownKey().length >= 32 ? ownKey() : metaSecret();
  if (!k) throw new Error("Sem chave para assinar (SOCIAL_TOKEN_KEY).");
  return createHmac("sha256", derive("kbos-social-sign", k)).update(`${label}:${value}`).digest("base64url");
}
