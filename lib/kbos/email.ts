// Serviço de e-mail do KBOS (Módulo auth / Magic Link).
//
// Prioridade de envio:
//   1. Resend via REST (`RESEND_API_KEY` + `RESEND_FROM` ou `EMAIL_FROM`) — sem dependências.
//   2. SMTP genérico (`SMTP_HOST` + `SMTP_USER`/`SMTP_PASS`) via nodemailer, se instalado
//      (`npm i nodemailer`). O import é dinâmico para não quebrar o build sem a lib.
//   3. Sem provedor: loga o link no servidor e retorna `{ sent: false }` sem lançar erro.
//
// A função NUNCA lança exceção: qualquer falha de rede/config retorna `sent: false`
// com `error` preenchido e log detalhado (sem vazar a API key).

export const PROD_URL = "https://kbos.kayquebrito.com.br";

export type EmailProvider = "resend" | "smtp" | "none";

export type EmailResult = {
  sent: boolean;
  provider: EmailProvider;
  /** ID retornado pelo provedor (Resend) quando disponível. */
  id?: string;
  /** Mensagem de erro legível quando `sent` é false. */
  error?: string;
};

export type EmailConfig = {
  resendKey: string;
  from: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  } | null;
};

/** Base pública usada nos links (Magic Link, callbacks).
 *
 * Mesma origem primeiro: o host do request (`x-forwarded-host`/`host`)
 * vence, para o link cair no domínio que o usuário está usando — o cookie de
 * sessão criado no `/verify` vale para aquele host (evita o comportamento
 * "dividido" entre raiz e subdomínio). Sem request, vale `APP_URL`, depois o
 * canônico/local. Host validado (anti header-injection no e-mail).
 */
export function appUrl(req?: Request): string {
  return hostBaseFromRequest(req) ?? appUrlEnv();
}

/** Extrai `scheme://host` do request (proxy incluso). Null se ausente/inválido. */
export function hostBaseFromRequest(req?: Request): string | null {
  try {
    const h = req?.headers;
    if (!h) return null;
    const fwd = h.get("x-forwarded-host")?.split(",")[0].trim();
    const rawHost = fwd || h.get("host")?.trim();
    if (!rawHost) return null;
    if (!/^[a-z0-9.-]+(:[0-9]{1,5})?$/i.test(rawHost)) return null;
    const fproto = h.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
    const scheme =
      fproto === "http" || fproto === "https"
        ? fproto
        : process.env.NODE_ENV === "production"
          ? "https"
          : "http";
    return `${scheme}://${rawHost}`;
  } catch {
    return null;
  }
}

/** Base via ambiente (sem request): `APP_URL`, senão canônico/local. */
export function appUrlEnv(): string {
  const raw = (process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (raw) return raw;
  // Em produção sem APP_URL, aponta para o domínio canônico em vez de localhost.
  if (process.env.NODE_ENV === "production") return PROD_URL;
  return "http://localhost:3000";
}

/** Remetente padrão do estúdio (domínio verificado no Resend). */
export const DEFAULT_FROM = "KBOS <contato@kayquebrito.com.br>";

/**
 * Remetente no formato que o Resend aceita (`Nome <email@dominio>`). Tolera o
 * que costuma aparecer no .env: aspas sobrando, só o e-mail, nome sem `< >`.
 * Sem e-mail válido, usa o padrão. (Em 27/10 o .env da VPS gerava
 * "Resend 422: Invalid `from` field" e nenhum código de login saía por e-mail.)
 */
export function normalizeFrom(raw: string | null | undefined): string {
  const v = (raw || "").trim().replace(/^['"]+|['"]+$/g, "").trim();
  const m = v.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!m) return DEFAULT_FROM;
  const name = v.slice(0, m.index).replace(/[<>"']/g, "").trim() || "KBOS";
  return `${name} <${m[0]}>`;
}

/** Lê e normaliza a configuração de e-mail a partir das variáveis de ambiente. */
export function getEmailConfig(): EmailConfig {
  const resendKey = (process.env.RESEND_API_KEY || "").trim();
  // `EMAIL_FROM` é alias aceito para `RESEND_FROM` (compat com .env da VPS).
  const from = normalizeFrom(
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    ""
  );

  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "").trim();
  const port = Number.parseInt(process.env.SMTP_PORT || "", 10);
  const secureRaw = (process.env.SMTP_SECURE || "").trim().toLowerCase();
  const smtp =
    host && user && pass
      ? {
          host,
          port: Number.isFinite(port) && port > 0 ? port : 587,
          secure: secureRaw === "1" || secureRaw === "true" || port === 465,
          user,
          pass,
          from: from || user,
        }
      : null;

  return { resendKey, from, smtp };
}

/** True quando há pelo menos um provedor capaz de enviar. */
export function isEmailConfigured(): boolean {
  const cfg = getEmailConfig();
  return Boolean((cfg.resendKey && cfg.from) || cfg.smtp);
}

/** Log de diagnóstico (sem segredos) — ajuda a depurar a VPS rapidamente. */
export function logEmailConfig(): void {
  const cfg = getEmailConfig();
  console.log(
    `[KBOS email] config: appUrl=${appUrl()} ` +
      `resend=${cfg.resendKey ? "key:sim" : "key:nao"} ` +
      `from=${cfg.from ? `"${cfg.from}"` : "ausente"} ` +
      `smtp=${cfg.smtp ? `${cfg.smtp.host}:${cfg.smtp.port}` : "nao-configurado"}`
  );
}

function toText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  from: string,
  key: string
): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text: toText(html) }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[KBOS email] Resend falhou (status ${res.status}) para ${to}: ${body.slice(0, 500)}`
      );
      return { sent: false, provider: "resend", error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    let id: string | undefined;
    try {
      id = (JSON.parse(body) as { id?: string }).id;
    } catch {
      /* corpo não-JSON — ignora */
    }
    console.log(`[KBOS email] enviado via Resend para ${to}${id ? ` (id=${id})` : ""}`);
    return { sent: true, provider: "resend", id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[KBOS email] erro de rede no Resend para ${to}: ${msg}`);
    return { sent: false, provider: "resend", error: `Rede Resend: ${msg}` };
  }
}

/** Carrega o nodemailer sem quebrar o build quando ele não está instalado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadNodemailer(): any | null {
  try {
    const loader = Function(
      "return typeof require !== 'undefined' ? require : null;"
    )() as ((name: string) => unknown) | null;
    return loader ? (loader("nodemailer") as unknown) : null;
  } catch {
    return null;
  }
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  smtp: NonNullable<EmailConfig["smtp"]>
): Promise<EmailResult> {
  const nodemailer = loadNodemailer();
  if (!nodemailer?.createTransport) {
    const error =
      "SMTP configurado mas a dependência `nodemailer` não está instalada. Rode `npm i nodemailer`.";
    console.error(`[KBOS email] ${error}`);
    return { sent: false, provider: "smtp", error };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    const info = await transporter.sendMail({
      from: smtp.from,
      to,
      subject,
      html,
      text: toText(html),
    });
    console.log(`[KBOS email] enviado via SMTP (${smtp.host}) para ${to} (id=${info?.messageId ?? "?"})`);
    return { sent: true, provider: "smtp", id: info?.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[KBOS email] SMTP ${smtp.host}:${smtp.port} falhou para ${to}: ${msg}`);
    return { sent: false, provider: "smtp", error: `SMTP: ${msg}` };
  }
}

/**
 * Envia um e-mail. Tenta Resend primeiro, depois SMTP.
 * Nunca lança exceção — falha retorna `{ sent: false, error }`.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const dest = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
    return { sent: false, provider: "none", error: "E-mail de destino inválido." };
  }
  const cfg = getEmailConfig();

  if (cfg.resendKey && cfg.from) {
    return sendViaResend(dest, subject, html, cfg.from, cfg.resendKey);
  }
  if (cfg.smtp) {
    return sendViaSmtp(dest, subject, html, cfg.smtp);
  }

  // Fallback: sem provedor — não quebra a aplicação, só loga.
  if (!cfg.resendKey) {
    console.log(
      `[KBOS email] sem provedor (RESEND_API_KEY ausente) — e-mail para ${dest}: ${subject}`
    );
  } else {
    console.log(
      `[KBOS email] sem remetente (RESEND_FROM/EMAIL_FROM ausente) — e-mail para ${dest}: ${subject}`
    );
  }
  if (cfg.smtp === null && (process.env.SMTP_HOST || "").trim()) {
    console.log("[KBOS email] SMTP parcial: defina SMTP_HOST + SMTP_USER + SMTP_PASS.");
  }
  return {
    sent: false,
    provider: "none",
    error: "Nenhum provedor de e-mail configurado (RESEND_API_KEY + RESEND_FROM/EMAIL_FROM ou SMTP_*).",
  };
}

/** Template do Magic Link (HTML + texto). */
export function buildMagicLinkEmail(link: string): { subject: string; html: string } {
  const subject = "Seu acesso ao Portal KBOS";
  const html = [
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">`,
    `<h2 style="margin:0 0 12px">Seu acesso ao Portal KBOS</h2>`,
    `<p>Olá! Clique no botão abaixo para entrar no portal. O link vale por <strong>15 minutos</strong> e só pode ser usado uma vez.</p>`,
    `<p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px">Entrar no portal</a></p>`,
    `<p style="color:#555;font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${link}">${link}</a></p>`,
    `<p style="color:#888;font-size:12px">Se você não pediu este acesso, ignore este e-mail.</p>`,
    `</div>`,
  ].join("");
  return { subject, html };
}
