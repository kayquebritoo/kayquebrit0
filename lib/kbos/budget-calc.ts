// Orçamentos — cálculos PUROS (client-safe: sem banco, sem Node).
// Fonte única da regra de totais, desconto e condições de pagamento, usada
// pelo servidor (`budgets.ts`, API, PDF) e pelo painel (`Orcamentos.tsx`).
import type { BudgetItem } from "./schema";

export type { BudgetItem };

export const BUDGET_CODE_START = 14001;

/** Recalcula totais das linhas + total geral (2 casas, sem float fantasma). */
export function calcBudgetTotals(items: BudgetItem[]): { items: BudgetItem[]; total: number } {
  const norm = (items || []).map((it) => {
    const quantity = Math.max(0, Number(it.quantity) || 0);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const total = Math.round(quantity * unitPrice * 100) / 100;
    const rawDate = typeof it.date === "string" ? it.date.trim() : "";
    return {
      service: String(it.service || "").trim(),
      description: it.description ? String(it.description).trim() || null : null,
      quantity,
      unitPrice,
      total,
      date: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null,
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

/* ---------------- condições de pagamento (0009) ---------------- */

export type PaymentCondition = "cash" | "installments" | "card";

export const PAYMENT_CONDITIONS: { id: PaymentCondition; label: string; hint: string }[] = [
  { id: "cash", label: "À vista", hint: "10% de desconto" },
  { id: "installments", label: "Parcelado", hint: "50% entrada + 50% entrega" },
  { id: "card", label: "Cartão", hint: "Crédito ou débito" },
];

export const normalizePaymentCondition = (v: unknown): PaymentCondition =>
  v === "installments" || v === "card" ? v : "cash";

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Opções calculadas sobre o total final (2 casas, sem float fantasma). */
export function calcPaymentOptions(total: number): {
  cash: number;
  cashSavings: number;
  entry: number;
  balance: number;
  card: number;
} {
  const base = Math.max(0, Number(total) || 0);
  const cash = round2(base * 0.9);
  const half = round2(base / 2);
  return {
    cash,
    cashSavings: round2(base - cash),
    entry: half,
    // Segunda parcela absorve o centavo do arredondamento.
    balance: round2(base - half),
    card: round2(base),
  };
}

/**
 * Orçamento recorrente (mensalidade) x projeto pontual. Fonte única usada pelo
 * PDF/contrato e pelo formulário do admin: palavra-chave explícita no
 * título/termos ou execução espalhada por 3+ meses distintos. Nunca por cliente.
 */
export function isRecurringInput(input: { title?: string | null; terms?: string | null; dates?: (string | null | undefined)[] }): boolean {
  const hay = `${input.title || ""} ${input.terms || ""}`.toLowerCase();
  if (/recorrente|mensalidade|\bmensal\b|acompanhamento mensal|por m[eê]s/.test(hay)) return true;
  const months = new Set((input.dates || []).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).map((d) => d.slice(0, 7)));
  return months.size >= 3;
}
