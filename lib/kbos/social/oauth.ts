// Login OAuth das redes: state assinado + cookie curto (10 min, httpOnly) com o PKCE e o destino da conexão.
// O cookie é criptografado (o code_verifier nunca aparece em claro) e só vale para a rede em que começou.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appUrlEnv } from "../email";
import { seal, socialSign, unseal } from "../social-crypto";
import type { ProviderId } from "./types";

export const FLOW_COOKIE = "kbos_social_flow";
export const FLOW_TTL_S = 600;

/** Para onde a conexão vai e quem está conectando. */
export type FlowTarget = { projectId: string | null; linkId: string | null; userId: string | null; via: "admin" | "portal" | "link"; back: string; network?: "instagram" | "facebook" | null };
export type Flow = FlowTarget & { nonce: string; provider: ProviderId; verifier: string | null; redirectUri: string; exp: number };

export const redirectUriFor = (provider: ProviderId) => `${appUrlEnv()}/api/social/${provider}/callback/`;

export function pkcePair(kind: "S256" | "hex") {
  const verifier = randomBytes(48).toString("base64url"); // 64 caracteres (43–128 pela RFC 7636)
  const digest = createHash("sha256").update(verifier);
  return { verifier, challenge: kind === "hex" ? digest.digest("hex") : digest.digest("base64url") };
}

const stateSig = (provider: string, nonce: string) => socialSign("oauth-state", `${provider}:${nonce}`);

/** Começa o login: devolve o `state` para a URL da rede e o valor do cookie. */
export function startFlow(provider: ProviderId, target: FlowTarget, pkce: false | "S256" | "hex", redirectUri = redirectUriFor(provider), now = Date.now()) {
  const nonce = randomBytes(18).toString("base64url");
  const p = pkce ? pkcePair(pkce) : null;
  const flow: Flow = { ...target, nonce, provider, verifier: p?.verifier ?? null, redirectUri, exp: now + FLOW_TTL_S * 1000 };
  return { state: `${nonce}.${stateSig(provider, nonce)}`, cookie: seal(JSON.stringify(flow)), challenge: p?.challenge, redirectUri };
}

/** Confere a volta: assinatura do state, cookie da mesma rede, mesmo nonce, dentro do prazo. */
export function finishFlow(provider: ProviderId, state: string | null, cookie: string | undefined, now = Date.now()): Flow | null {
  const [nonce, sig] = (state || "").split(".");
  if (!nonce || !sig || !cookie) return null;
  const expected = stateSig(provider, nonce);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let flow: Flow;
  try { flow = JSON.parse(unseal(cookie)) as Flow; } catch { return null; }
  if (flow.provider !== provider || flow.nonce !== nonce || flow.exp < now) return null;
  return flow;
}

export const flowCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: FLOW_TTL_S, path: "/api/" });

/** Só caminhos internos (nada de redirecionar para fora). */
export const safeBack = (p: string | null | undefined, fallback: string) => (p && /^\/(?!\/)[\w\-/.?=&%]*$/.test(p) ? p : fallback);
