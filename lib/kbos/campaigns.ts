// Campanhas de disparo — Fase 3.
//
// - Funções puras (testáveis sem I/O, client-safe: sem imports server).
//   NÃO importar `./inbox` aqui (puxaria o cliente do banco p/ o bundle).
// - O fan-out e o envio vivem nos handlers do worker (`job-handlers.ts`);
//   a API HTTP só enfileira UM job `campaign.dispatch` (nunca trava).

/** Dígitos de um telefone (cópia local p/ manter este módulo client-safe). */
function digitsOf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export const CAMPAIGN_TARGETS = ["all", "lead", "client", "partner", "archived"] as const;
export type CampaignTarget = (typeof CAMPAIGN_TARGETS)[number];

export const TEMPLATE_VARS = [
  { id: "name", label: "Nome", sample: "Maria Silva" },
  { id: "firstName", label: "Primeiro nome", sample: "Maria" },
  { id: "company", label: "Empresa", sample: "Padaria Pão Dourado" },
  { id: "email", label: "E-mail", sample: "maria@exemplo.com" },
  { id: "phone", label: "Telefone", sample: "+55 (11) 99999-8888" },
] as const;

export type TemplateContact = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** `{{name}}`, `{{ firstName }}`… — chaves desconhecidas são preservadas. */
export function renderTemplate(
  template: string,
  contact: TemplateContact
): string {
  const name = (contact.name || "").trim();
  const values: Record<string, string> = {
    name,
    firstname: name.split(/\s+/)[0] ?? "",
    company: (contact.company || "").trim(),
    email: (contact.email || "").trim(),
    phone: (contact.phone || "").trim(),
  };
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (m, key: string) => {
    const v = values[key.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Variáveis `{{...}}` presentes no template (p/ preview/validação). */
export function templateVars(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/{{\s*([a-zA-Z]+)\s*}}/g)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Público-alvo: `all` = lead+client+partner (arquivados nunca recebem —
 * equivalem a opt-out). Retorna os status do CRM a incluir.
 */
export function targetStatuses(target: string): Array<"lead" | "client" | "partner" | "archived"> {
  if (target === "all") return ["lead", "client", "partner"];
  if (target === "lead" || target === "client" || target === "partner" || target === "archived") {
    return [target];
  }
  return ["lead", "client", "partner"];
}

/** True quando o contato tem telefone discável (WhatsApp). */
export function mailable(phone: unknown): boolean {
  return digitsOf(phone).length >= 10;
}

/* ---------------- pacing anti-banimento ---------------- */

/** Intervalo base entre envios (ms). Padrão 8s — ajuste via `CAMPAIGN_SEND_DELAY_MS`. */
export function sendDelayMs(): number {
  const n = Number(process.env.CAMPAIGN_SEND_DELAY_MS || 8_000);
  return Number.isFinite(n) && n >= 1_000 ? Math.floor(n) : 8_000;
}

/**
 * Delay escalonado do i-ésimo destinatário + jitter de até +50% (parece
 * humano e evita rajadas). Puro/determinístico dado o `rand` injetado.
 */
export function staggeredDelayMs(index: number, baseMs: number, rand = Math.random): number {
  const jitter = Math.floor(rand() * (baseMs / 2));
  return index * baseMs + jitter;
}

/** Estimativa de duração total do disparo (ms) p/ N destinatários. */
export function estimateDurationMs(total: number, baseMs: number): number {
  if (total <= 0) return 0;
  return (total - 1) * baseMs + Math.floor(baseMs / 2);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}min` : ""}`;
}
