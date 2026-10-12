// Senhas do KBOS (login e-mail + senha).
//
// scrypt nativo do Node (sem dependência extra), formato:
//   "scrypt$<saltHex>$<hashHex>"  (N=16384, r=8, p=1, keylen 64)
// Comparação em tempo constante; nunca logar hash/senha.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const KEYLEN = 64;

export function isPasswordHash(v: string | null | undefined): boolean {
  if (!v) return false;
  const parts = v.split("$");
  return parts.length === 3 && parts[0] === PREFIX && /^[0-9a-f]+$/.test(parts[1]) && /^[0-9a-f]+$/.test(parts[2]);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== PREFIX) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== KEYLEN) return false;
    const actual = scryptSync(password, salt, KEYLEN);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Regra mínima: 8+ chars (admin bypass continua aceito à parte). */
export function isPasswordStrongEnough(password: string): boolean {
  return password.length >= 8 && password.length <= 256;
}
