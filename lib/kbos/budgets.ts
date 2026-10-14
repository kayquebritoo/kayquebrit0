// Orçamentos — helpers puros (client-safe) + criação server-side.
//
// Convenções:
// - Itens: `{ service, description?, quantity, unitPrice, total }`; o total
//   da linha é sempre `quantity × unitPrice` recalculado no servidor (o
//   client envia quantidade/preço; o servidor é a fonte do total).
// - Código legível `#14xxx`: próximo número após o maior existente (início
//   14001), com retry em conflito de unicidade (concorrência do assistente).
// - `parseBudgetCommand`: interpreta linguagem natural ("criar orçamento para
//   Maria, site 3000, logo 800") de forma determinística — sem LLM, funciona
//   no modo base e é testável.
import { desc, ilike, sql } from "drizzle-orm";
import { db } from "./db";
import { budgets, contacts, type BudgetItem } from "./schema";

export type { BudgetItem };

export const BUDGET_CODE_START = 14001;

/** Recalcula totais das linhas + total geral (2 casas, sem float fantasma). */
export function calcBudgetTotals(items: BudgetItem[]): { items: BudgetItem[]; total: number } {
  const norm = (items || []).map((it) => {
    const quantity = Math.max(0, Number(it.quantity) || 0);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const total = Math.round(quantity * unitPrice * 100) / 100;
    return {
      service: String(it.service || "").trim(),
      description: it.description ? String(it.description).trim() || null : null,
      quantity,
      unitPrice,
      total,
    };
  });
  const total = Math.round(norm.reduce((a, i) => a + i.total, 0) * 100) / 100;
  return { items: norm, total };
}

export const budgetTotal = (items: BudgetItem[]): number => calcBudgetTotals(items).total;

export const formatBRL = (v: number | string | null | undefined): string =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------------- desconto + total final (0008) ---------------- */

export type DiscountType = "fixed" | "percent";
export type BudgetStatus = "draft" | "sent" | "approved" | "completed" | "cancelled" | "rejected";

export const normalizeDiscountType = (v: unknown): DiscountType =>
  v === "percent" ? "percent" : "fixed";

/** Desconto em R$ a partir do subtotal (percentual limitado a 0–100). */
export function calcDiscountAmount(subtotal: number, type: DiscountType, value: number): number {
  const base = Math.max(0, Number(subtotal) || 0);
  const v = Math.max(0, Number(value) || 0);
  if (type === "percent") {
    return Math.round(base * Math.min(v, 100)) / 100;
  }
  return Math.round(Math.min(v, base) * 100) / 100;
}

export function calcBudgetWithDiscount(
  items: BudgetItem[],
  discountType?: DiscountType | string | null,
  discountValue?: number | string | null
): { items: BudgetItem[]; subtotal: number; discountAmount: number; total: number } {
  const { items: norm, total: subtotal } = calcBudgetTotals(items);
  const type = normalizeDiscountType(discountType);
  const value = Math.max(0, Number(discountValue) || 0);
  const discountAmount = calcDiscountAmount(subtotal, type, value);
  const total = Math.round((subtotal - discountAmount) * 100) / 100;
  return { items: norm, subtotal, discountAmount, total };
}

/** Próximo código (`#14001`, `#14002`, …) a partir do maior já gravado. */
export async function nextBudgetCode(): Promise<string> {
  const rows = await db()
    .select({ code: budgets.code })
    .from(budgets)
    .where(sql`${budgets.code} LIKE '#14%'`)
    .orderBy(desc(budgets.code))
    .limit(1);
  const last = rows[0]?.code ? Number(String(rows[0].code).replace("#", "")) : NaN;
  const next = Number.isFinite(last) && last >= BUDGET_CODE_START ? last + 1 : BUDGET_CODE_START;
  return `#${next}`;
}

export type BudgetCreateInput = {
  title: string;
  contactId?: string | null;
  items: BudgetItem[];
  status?: BudgetStatus;
  validUntil?: Date | null;
  terms?: string | null;
  bankInfo?: string | null;
  // Retrato do cliente (0008): preenchido mesmo sem vínculo no CRM.
  clientName?: string | null;
  clientCompany?: string | null;
  // Datas de execução da proposta (coberturas/eventos) — ISO `yyyy-mm-dd`.
  eventDates?: string[] | null;
  discountType?: DiscountType | null;
  discountValue?: number | null;
};

/**
 * Cria o orçamento com código sequencial (retry em colisão de `code`).
 * O total final aplica o desconto sobre o subtotal dos itens.
 * Retorna a linha inserida.
 */
export async function createBudget(input: BudgetCreateInput) {
  const { items, total } = calcBudgetWithDiscount(input.items, input.discountType, input.discountValue);
  const eventDates = (input.eventDates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const code = await nextBudgetCode();
      const rows = await db()
        .insert(budgets)
        .values({
          code,
          contactId: input.contactId ?? null,
          title: input.title,
          status: input.status ?? "draft",
          totalAmount: String(total),
          validUntil: input.validUntil ?? null,
          terms: input.terms ?? null,
          bankInfo: input.bankInfo ?? null,
          items,
          clientName: input.clientName?.trim() || null,
          clientCompany: input.clientCompany?.trim() || null,
          eventDates: eventDates.length ? eventDates : null,
          discountType: input.discountType ?? null,
          discountValue: input.discountValue != null ? String(input.discountValue) : null,
        })
        .returning();
      return rows[0];
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao criar orçamento.");
}

/* ---------------- linguagem natural (assistente de IA) ---------------- */

export type ParsedBudgetCommand = {
  title: string;
  clientName: string | null;
  items: BudgetItem[];
};

/** "3.000", "3000", "3 mil", "2.5k", "R$ 1.200,50" → número. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/^r\$\s*/, "");
  let mult = 1;
  const milMatch = s.match(/^(.+?)\s*mil$/);
  if (milMatch) {
    s = milMatch[1];
    mult = 1000;
  } else {
    const kMatch = s.match(/^(.+?)\s*k$/);
    if (kMatch) {
      s = kMatch[1];
      mult = 1000;
    }
  }
  // "1.200,50" (pt) vs "1200.50" (en): vírgula = decimal quando presente.
  let n: number;
  if (s.includes(",")) {
    n = Number(s.replace(/\./g, "").replace(",", "."));
  } else {
    n = Number(s.replace(/(?<=\d)\.(?=\d{3}\b)/g, ""));
    if (!Number.isFinite(n)) n = Number(s);
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * mult * 100) / 100;
}

const BUDGET_VERBS = /(or[çc]amento|proposta|cota[çc][ãa]o|quote)/i;

export function looksLikeBudgetCommand(text: string): boolean {
  return (
    BUDGET_VERBS.test(text) &&
    /(cri|ger|mont|faz|nov|cadastr|registr|para |p\/|p\/o |cliente)/i.test(text)
  );
}

function splitParts(text: string): string[] {
  return text
    .split(/[\n;]+|\s+e\s+(?=[a-zà-ú]+\s+\d)|\s*,\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Extrai `{ title, clientName, items }` de um comando como:
 * "criar orçamento site para Maria, página inicial 3000, blog 800"
 * Heurística por parte: pega o ÚLTIMO número da parte como valor e o
 * restante como nome do serviço; "para <Nome>" / "cliente <Nome>" / "p/ <Nome>"
 * define o cliente. Retorna null quando não há itens com valor.
 */
export function parseBudgetCommand(text: string): ParsedBudgetCommand | null {
  if (!looksLikeBudgetCommand(text)) return null;
  const clean = text.replace(/^(por favor\s+)?(crie|criar|gere|gerar|monte|montar|fa[çc]a|fazer|novo|nova)\s+/i, "");

  let clientName: string | null = null;
  const clientMatch = clean.match(/\b(?:para(?: o| a)?|cliente|p\/o?)\s+([A-ZÀ-Úa-zà-ú][\wÀ-ú]*(?:\s+[A-ZÀ-Úa-zà-ú][\wÀ-ú]*){0,3})/);
  if (clientMatch) clientName = clientMatch[1].trim();

  const titleMatch = clean.match(/^(?:or[çc]amento|proposta)(?:\s+de)?\s+([a-zà-ú][^,;\n]*?)(?=\s+(?:para|cliente|p\/)|\s*,|\s*;|$)/i);
  const title = (titleMatch?.[1]?.trim() || "Orçamento").slice(0, 160);

  // Corta o cabeçalho do comando ("orçamento site para Maria:") para que o
  // primeiro item não herde o verbo/título e seja descartado pelo filtro.
  let itemsText = clean;
  const colon = itemsText.indexOf(":");
  if (colon >= 0) {
    itemsText = itemsText.slice(colon + 1);
  } else {
    itemsText = itemsText
      .replace(/^(?:or[çc]amento|proposta|cota[çc][ãa]o)(?:\s+de)?\s+/i, "")
      .replace(/\b(?:para(?:\s+o|\s+a)?|cliente|p\/o?)\s+[A-ZÀ-Úa-zà-ú][\wÀ-ú]*(?:\s+[A-ZÀ-Úa-zà-ú][\wÀ-ú]*){0,3}/, "");
  }

  const items: BudgetItem[] = [];
  for (const part of splitParts(itemsText)) {
    if (BUDGET_VERBS.test(part) && !/\d/.test(part)) continue;
    const moneyMatch = part.match(/(r\$\s*)?(\d[\d.,]*(?:\s*(?:mil|k))?)\s*$/i);
    if (!moneyMatch) continue;
    const value = parseMoney(moneyMatch[2]);
    if (value === null) continue;
    let service = part.slice(0, moneyMatch.index).trim().replace(/^(?:de|do|da|para|–|-)\s+/i, "");
    if (!service || service.length < 2) continue;
    service = service.slice(0, 120);
    items.push({ service, description: null, quantity: 1, unitPrice: value, total: value });
  }
  if (items.length === 0) return null;
  return { title: title || "Orçamento", clientName, items: calcBudgetTotals(items).items };
}

/** Resolve o contato no CRM pelo nome (ilike, melhor match) — null se ambíguo/inexistente. */
export async function findContactByName(name: string) {
  const rows = await db()
    .select()
    .from(contacts)
    .where(ilike(contacts.name, `%${name.trim().slice(0, 60)}%`))
    .limit(5);
  if (rows.length === 0) return null;
  const exact = rows.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  return exact ?? (rows.length === 1 ? rows[0] : null);
}
