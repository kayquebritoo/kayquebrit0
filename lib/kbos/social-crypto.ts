// Tokens das redes sociais no banco: sempre criptografados (AES-256-GCM).
// A chave vem do segredo do app da Meta: trocar o segredo pede reconectar as contas (de propósito).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret = process.env.META_APP_SECRET || "") {
  if (secret.length < 16) throw new Error("META_APP_SECRET não configurado.");
  return createHash("sha256").update(`kbos-social-token:${secret}`).digest();
}

export function seal(plain: string, secret?: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function unseal(sealed: string, secret?: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Token em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}
