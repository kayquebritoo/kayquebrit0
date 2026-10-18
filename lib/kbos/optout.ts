// Descadastro de campanhas: o contato responde SAIR e para de receber DIVULGAÇÃO.
// Avisos de projeto, cobrança e agenda continuam normais (não são marketing).
import { eq } from "drizzle-orm";
import { db } from "./db";
import { contacts } from "./schema";
import { findContactByPhone, onlyDigits, type InboundMessage } from "./inbox";
import { queueWhatsApp } from "./whatsapp";

export const OPT_OUT_FOOTER = "Para não receber mais mensagens de divulgação, responda SAIR.";
export const OPT_OUT_CONFIRM = "Pronto, você não vai mais receber mensagens de divulgação. Avisos sobre seus projetos e pagamentos continuam normais. Se mudar de ideia, é só me chamar.";

const KEYWORDS = new Set(["sair", "parar", "stop", "descadastrar", "cancelar inscricao", "nao quero receber", "nao quero mais receber", "remover", "sair da lista"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** Só a mensagem inteira conta ("sair", "SAIR!", "Parar"). Frase longa nunca é descadastro: evita falso positivo em conversa de projeto. */
export function isOptOutMessage(text: string | null | undefined): boolean {
  return !!text && KEYWORDS.has(norm(text));
}

/** Rodapé de descadastro em toda mensagem de campanha (sem duplicar). */
export function withOptOutFooter(message: string): string {
  return /responda\s+sair/i.test(message) ? message : `${message.trimEnd()}\n\n${OPT_OUT_FOOTER}`;
}

/** Quantos envios de campanha ainda cabem hoje e em quais "dias a partir de agora" cada destinatário cai. */
export function dailyCap(): number {
  const n = Number(process.env.CAMPAIGN_DAILY_CAP || 80);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 80;
}

/** Dia (0 = hoje) em que o i-ésimo destinatário sai, respeitando o teto diário e o que já foi enviado hoje. */
export function dayOffsetFor(index: number, cap: number, sentToday: number): number {
  const room = Math.max(0, cap - sentToday);
  if (index < room) return 0;
  return 1 + Math.floor((index - room) / cap);
}

export async function handleOptOut(inb: InboundMessage) {
  if (inb.fromMe || inb.isGroup || !isOptOutMessage(inb.content)) return { optedOut: false };
  const digits = onlyDigits(inb.phoneDigits);
  if (!digits) return { optedOut: false };
  const contact = await findContactByPhone(digits);
  if (!contact) return { optedOut: false };
  if (!contact.marketingOptOutAt) {
    await db().update(contacts).set({ marketingOptOutAt: new Date() }).where(eq(contacts.id, contact.id));
    await queueWhatsApp(digits, OPT_OUT_CONFIRM, "campaign.optout");
  }
  return { optedOut: true };
}
