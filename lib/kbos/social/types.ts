// Contrato comum dos provedores de redes sociais (OAuth oficial de cada rede + publicar quando a rede deixa).
// Só servidor. Todo provedor recebe `f` (fetch) injetável: os testes simulam a rede sem tocar a internet.
export type Fetch = typeof fetch;

export type ProviderId = "meta" | "youtube" | "google" | "tiktok" | "pinterest" | "linkedin";

/** Erro vindo da rede. `expired` = token vencido/revogado (a conta precisa reconectar). */
export class SocialError extends Error {
  constructor(message: string, public code?: number | string, public expired = false) { super(message); }
}

export type Tokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string[];
  /** Quem logou (id e nome na rede), quando a rede informa. */
  externalUserId?: string | null;
  userName?: string | null;
};

/** Conta/página/canal onde o KBOS publica. `token` só quando a conta tem token próprio (Página da Meta). */
export type ProviderAccount = {
  network: string;
  externalId: string;
  pageId?: string | null;
  name: string;
  username?: string | null;
  pictureUrl?: string | null;
  token?: string | null;
};

export type Media = { kind: "image" | "video"; url: string };
export type PublishInput = { format: string; caption: string; media: Media[] };
export type PublishResult = { externalId: string; url: string | null };
export type PublishAccount = { externalId: string; pageId: string | null; token: string };

export interface SocialProvider {
  id: ProviderId;
  label: string;
  /** Redes (como em `NETWORKS` do conteúdo) que esta conexão traz. */
  networks: string[];
  /** Escopos mínimos pedidos no login. */
  scopes: string[];
  /** PKCE no login (quando a rede aceita no fluxo web). `hex` = TikTok (desafio em hexadecimal). */
  pkce: false | "S256" | "hex";
  /** O que dá para fazer hoje por esta conexão. */
  canPublish: boolean;
  /** Chaves do app configuradas no servidor. Sem elas a rede aparece como "Em breve". */
  configured(): boolean;
  authUrl(p: { redirectUri: string; state: string; codeChallenge?: string }): string;
  exchangeCode(p: { code: string; redirectUri: string; codeVerifier?: string }, f?: Fetch): Promise<Tokens>;
  /** Renova o token de acesso. Ausente = a rede não renova (reconectar quando vencer). */
  refresh?(refreshToken: string, f?: Fetch): Promise<Tokens>;
  listAccounts(t: Tokens, f?: Fetch): Promise<ProviderAccount[]>;
  /** Revoga na rede. Devolve false quando a rede não tem como revogar por API (o usuário remove no app dela). */
  revoke(token: string, f?: Fetch): Promise<boolean>;
  publish?(network: string, account: PublishAccount, input: PublishInput, f?: Fetch): Promise<PublishResult>;
}

/** Lê JSON de uma resposta OAuth/REST e transforma erro da rede em SocialError. */
export async function readJson<T>(res: Response, who: string): Promise<T> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* corpo não-JSON */ }
  if (!res.ok || json.error) {
    const err = json.error as unknown;
    const e = typeof err === "object" && err ? (err as Record<string, unknown>) : {};
    const msg = String(json.error_description || e.message || json.message || (typeof err === "string" ? err : "") || `${who} respondeu ${res.status}.`);
    const code = (e.code ?? json.code ?? res.status) as number | string;
    const expired = res.status === 401 || err === "invalid_grant" || code === "access_token_invalid" || code === 190;
    throw new SocialError(msg.slice(0, 300), code, expired);
  }
  return json as T;
}

export const expiresIn = (seconds?: number | null) => (seconds ? new Date(Date.now() + seconds * 1000) : null);
export const form = (o: Record<string, string | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) qs.set(k, v);
  return qs;
};
