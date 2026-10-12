// Acesso administrativo de emergência (produção/VPS).
//
// Motivação: o Magic Link depende de provedor de e-mail externo (Resend/SMTP).
// Se o provedor falhar na VPS, o admin ficaria trancado para fora do `/admin`.
// Por isso existe um bypass opcional e explícito:
//
//   KBOS_ADMIN_BYPASS_TOKEN="<segredo longo e aleatório>"
//
// Comportamento:
// - O token NUNCA é gravado no banco (a coluna `kbos_sessions.id` é uuid; o
//   bypass é comparado em memória, antes de qualquer query — evita erros
//   `invalid input syntax for type uuid`).
// - `middleware.ts` aceita o token no cookie de sessão e libera `/admin/*`
//   (e demais rotas protegidas) sem redirect para `/entrar`.
// - `sessionUser()` (rbac) resolve o token para o usuário admin (do banco,
//   ou sintético se o banco estiver inacessível) com `role: "admin"`.
// - `POST /api/auth/request` aceita `{ email, adminBypass }`: se o e-mail for
//   o do admin e o bypass conferir, cria sessão real no banco e seta o cookie
//   — sem depender do disparo de e-mail.
// - Sem `KBOS_ADMIN_BYPASS_TOKEN` configurado, todo o bypass fica inativo e o
//   fluxo segue 100% via Magic Link (fail-closed).
//
// Segurança: o bypass SÓ vale para o e-mail do administrador principal e
// exige o segredo. Nunca exponha o token em logs, respostas ou no client.

/** E-mail do administrador principal (acesso livre às rotas `/admin/*`). */
export const ADMIN_EMAIL = "contato@kayquebrito.com.br";

/** Nome do cookie de sessão principal (ver `rbac.ts`). */
export const SESSION_COOKIE_NAME = "kbos_session";

/**
 * Nome alternativo do cookie aceito pelo middleware/RBAC.
 * Existe por compatibilidade com a convenção `kbos.session-token` usada no
 * deploy da VPS — ambos os nomes são lidos; a escrita usa o principal.
 */
export const SESSION_COOKIE_ALT = "kbos.session-token";

/** Cookies lidos (nesta ordem) pelo middleware e pelo RBAC. Edge-safe. */
export const SESSION_COOKIE_ALIASES = [SESSION_COOKIE_NAME, SESSION_COOKIE_ALT] as const;

/** Variáveis de ambiente aceitas para o segredo (primeira definida vence). */
const BYPASS_ENV_KEYS = [
  "KBOS_ADMIN_BYPASS_TOKEN",
  "KBOS_ADMIN_PASSWORD",
  "KBOS_SESSION_TOKEN",
  "ADMIN_SESSION_TOKEN",
] as const;

/** Lê o segredo de bypass do ambiente (null quando não configurado). */
export function getAdminBypassToken(): string | null {
  for (const key of BYPASS_ENV_KEYS) {
    const v = (process.env[key] || "").trim();
    // Exige segredo com entropia mínima para evitar bypass acidental ("123", "admin"...).
    if (v.length >= 16) return v;
  }
  return null;
}

/** True quando o e-mail é o do administrador principal (case-insensitive). */
export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

/**
 * Comparação em tempo constante para não vazar prefixo do segredo via timing.
 * Retorna false quando o bypass está desativado (sem segredo configurado).
 */
export function isAdminBypass(value: string | null | undefined): boolean {
  if (!value) return false;
  const secret = getAdminBypassToken();
  if (!secret) return false;
  if (value.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= value.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

/** uuid v4/v7 — protege as queries contra `invalid input syntax for type uuid`. */
export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

// Bypass aberto da VPS (uso direto sem login).
//
// `KBOS_BYPASS_ADMIN="true"` libera TODAS as rotas `/admin/*` (páginas e
// APIs) sem sessão — sem redirect para `/entrar`, sem Magic Link.
// ⚠️ SEGURANÇA: com a flag ativa, qualquer pessoa com a URL tem poder total
// de admin (ler/editar CRM e financeiro, disparar campanhas/WhatsApp).
// Use SOMENTE em rede privada/firewall restrito, ou temporariamente para
// operação local — nunca exponha com a flag ligada na internet aberta.
// Ausente ou diferente de "true" (case-insensitive) = login normal
// (fail-closed). Edge-safe: só lê `process.env` + comparação de string.
export function isAdminBypassOpen(): boolean {
  return (process.env.KBOS_BYPASS_ADMIN || "").trim().toLowerCase() === "true";
}

let _bypassWarned = false;

/** Aviso único por processo quando o bypass aberto atende alguém. */
export function warnAdminBypassOpen(): void {
  if (_bypassWarned) return;
  _bypassWarned = true;
  console.warn(
    "[KBOS] KBOS_BYPASS_ADMIN=true — /admin ABERTO sem login. " +
      "Restringir no firewall ou desativar após o uso."
  );
}
