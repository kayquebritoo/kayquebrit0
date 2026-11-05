// Regras da venda conectada, compartilhadas entre painel e servidor.
import { z } from "zod";
import { companyProfileSchema } from "./planning-model";
import { calcPaymentOptions, isRecurringInput } from "./budget-calc";

export const SERVICE_TEMPLATES = {
  branding: ["Briefing e referências da marca", "Conceito e identidade visual", "Revisão com o cliente", "Manual de Identidade e arquivos finais"],
  site: ["Briefing e arquitetura de conteúdo", "Design de interface (UI/UX) e aprovação", "Desenvolvimento, integrações e testes", "Publicação, homologação e entrega"],
  audiovisual: ["Briefing e roteiro", "Produção e captação", "Edição e revisão", "Entrega dos arquivos"],
  mensal: ["Planejamento do ciclo", "Produção do ciclo", "Revisão com o cliente", "Entrega e fechamento do ciclo"],
} as const;
export const SERVICE_LABELS = { branding: "Branding", site: "Site", audiovisual: "Audiovisual", mensal: "Plano mensal" } as const;
export type SaleService = keyof typeof SERVICE_LABELS;

export const PROJECT_SUBTYPES: Record<SaleService, readonly string[]> = {
  site: ["Landing Page", "E-commerce e Gestão", "Site Institucional", "Portal / Sistema Web"],
  branding: ["Identidade Visual Completa", "Redesign de Marca", "Naming e Posicionamento", "Manual da Marca"],
  audiovisual: ["Cobertura de Evento", "Vídeo Institucional / Comercial", "Produção de Conteúdo / Reels", "Ensaio Fotográfico"],
  mensal: ["Gestão Mensal de Conteúdo", "E-commerce e Gestão Mensal", "Acompanhamento Audiovisual", "Suporte e Evolução Web"],
} as const;

export function inferServiceAndSubtype(input: {
  title?: string | null;
  terms?: string | null;
  items?: { service?: string | null; description?: string | null }[];
  dates?: (string | null | undefined)[] | null;
}): { service: SaleService; subtype: string } {
  const itemsText = (input.items || []).map((i) => `${i.service || ""} ${i.description || ""}`).join(" ");
  const hay = `${input.title || ""} ${itemsText} ${input.terms || ""}`.toLowerCase();
  if (isRecurringInput({ title: input.title, terms: input.terms, dates: input.dates || undefined })) {
    if (/e-?commerce|loja/i.test(hay)) return { service: "mensal", subtype: "E-commerce e Gestão Mensal" };
    return { service: "mensal", subtype: "Gestão Mensal de Conteúdo" };
  }
  if (/landing\s*page|\blp\b/i.test(hay)) return { service: "site", subtype: "Landing Page" };
  if (/e-?commerce|loja\s+virtual/i.test(hay)) return { service: "site", subtype: "E-commerce e Gestão" };
  if (/\bsite\b|web|portal|sistema|p[áa]gina/i.test(hay)) return { service: "site", subtype: "Site Institucional" };
  if (/cobertura|evento|capta[çc][ãa]o|v[íi]deo|audiovisual|foto|filmagem|reels/i.test(hay)) {
    return { service: "audiovisual", subtype: "Cobertura de Evento" };
  }
  return { service: "branding", subtype: "Identidade Visual Completa" };
}

export function localDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Belem", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Data inválida.");

/** Um plano iniciado em 01/11, por 5 meses, termina em 01/04. */
export function planEndDate(start: string, months: number): string {
  if (!day.safeParse(start).success || !Number.isInteger(months) || months < 1 || months > 36) return "";
  const [y, m, d] = start.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay), 12)).toISOString().slice(0, 10);
}
const httpsUrl = z.url().max(2000).refine((v) => v.startsWith("https://"), "Use um link HTTPS.");
const materialRole = z.enum(["manual", "reference"]);
export const saleMaterialSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"), fileId: z.uuid(), name: z.string().max(200), role: materialRole,
    sha256: z.string().optional(), size: z.number().optional()
  }),
  z.object({ kind: z.literal("link"), url: httpsUrl, name: z.string().trim().min(1).max(200), role: materialRole }),
]);
export type SaleMaterial = z.infer<typeof saleMaterialSchema>;

export const PROGRESSIVE_DISCOUNT_RATES: Record<number, number> = {
  1: 10,
  2: 6,
  3: 3,
  4: 0,
} as const;

export const salePlanSchema = z.object({
  service: z.enum(["branding", "site", "audiovisual", "mensal"]),
  subtype: z.string().trim().max(120).nullable().optional(),
  startDate: day,
  deliveryDate: day,
  months: z.number().int().min(1).max(36).default(1),
  manualUrl: z.union([httpsUrl, z.literal("")]).default(""),
  attachments: z.array(saleMaterialSchema).max(20).optional(),
  dealId: z.uuid().nullable().optional(),
  paymentCondition: z.enum(["cash", "installments", "card"]).optional(),
  applyCashDiscount: z.boolean().optional(),
  progressiveDiscounts: z.boolean().optional(),
  installmentsCount: z.number().int().min(1).max(12).optional(),
  maxInstallments: z.number().int().min(1).max(12).optional(),
  replaceExisting: z.boolean().optional(),
  sellerFeePercent: z.number().min(0).max(50).optional(),
  discountType: z.enum(["fixed", "percent"]).optional(),
  discountValue: z.number().min(0).max(1e12).optional(),
  deliveryDeadline: z.string().trim().max(120).nullable().optional(),
}).refine((v) => v.deliveryDate >= v.startDate, "A entrega deve ser igual ou posterior ao início.")
  .refine((v) => {
    if (v.service !== "mensal") return true;
    return v.deliveryDate === planEndDate(v.startDate, v.months);
  }, "O término do plano deve corresponder ao início mais a duração em meses.");
// O Manual de Identidade é opcional ao publicar: o cliente pode enviar a marca na própria página de aceite.
export type SalePlan = z.infer<typeof salePlanSchema>;
export const saleAcceptanceSchema = z.object({
  signerName: z.string().trim().min(3).max(160),
  contractAccepted: z.literal(true),
  manualAccepted: z.literal(true),
  installmentsCount: z.number().int().min(1).max(4).optional(),
  companyProfile: companyProfileSchema.optional(),
});
export type Installment = { label: string; amount: number; dueDate: string; onAcceptance?: boolean };
export const installmentsTotal = (items: Installment[]) => items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

/**
 * Divide `total` em `count` parcelas exatas em centavos, sem juros e sem perda de centavos.
 * Eventual resíduo de arredondamento (1 a count-1 centavos) é alocado na 1ª parcela
 * (consistente com `calcPaymentOptions`), garantindo soma idêntica ao total contratado.
 */
export function splitExactInstallments(total: number, count: number): number[] {
  const n = Math.max(1, Math.trunc(count));
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;
  return Array.from({ length: n }, (_, idx) => (idx === 0 ? baseCents + remainderCents : baseCents) / 100);
}

function installmentDueDate(startDate: string, deliveryDate: string, idx: number, count: number): string {
  if (idx === 0) return startDate;
  if (count === 2 && idx === 1) return deliveryDate >= startDate ? deliveryDate : startDate;
  const [y, m, d] = startDate.split("-").map(Number);
  const monthly = new Date(Date.UTC(y, m - 1 + idx, Math.min(d, 28), 12)).toISOString().slice(0, 10);
  if (idx === count - 1 && deliveryDate > monthly) return deliveryDate;
  return monthly;
}

export function paymentSchedule(total: number, condition: string | null, plan: SalePlan): Installment[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error("O orçamento precisa ter valor positivo.");
  if (plan.service === "mensal") {
    return Array.from({ length: plan.months }, (_, index) => {
      const [y, m] = plan.startDate.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1 + index, 5, 12));
      return { label: `Mensalidade ${index + 1}/${plan.months}`, amount: total, dueDate: index ? date.toISOString().slice(0, 10) : plan.startDate, onAcceptance: index === 0 };
    });
  }
  const effectiveCondition = plan.paymentCondition ?? condition;
  if (effectiveCondition !== "cash" && effectiveCondition !== "installments" && effectiveCondition !== "card") {
    throw new Error("Escolha a condição de pagamento no orçamento.");
  }
  const count =
    plan.installmentsCount != null && plan.installmentsCount >= 1
      ? plan.installmentsCount
      : effectiveCondition === "installments"
        ? 2
        : 1;

  // Descontos progressivos (1x: 10%, 2x: 6%, 3x: 3%, 4x: 0%) calculados sempre sobre `total` (valor base),
  // nunca acumulando nem aplicando duas vezes.
  if (plan.progressiveDiscounts === true) {
    const rate = PROGRESSIVE_DISCOUNT_RATES[count] ?? 0;
    const discountAmount = Math.round(total * (rate / 100) * 100) / 100;
    const finalTotal = Math.round((total - discountAmount) * 100) / 100;
    const amounts = splitExactInstallments(finalTotal, count);
    if (count === 1) {
      return [
        {
          label: rate > 0 ? `À vista (1x · ${rate}% de desconto)` : "À vista (1x)",
          amount: amounts[0],
          dueDate: plan.startDate,
          onAcceptance: true,
        },
      ];
    }
    if (count === 2) {
      return [
        {
          label: rate > 0 ? `Entrada (1/2 · ${rate}% OFF)` : "Entrada (50%)",
          amount: amounts[0],
          dueDate: plan.startDate,
          onAcceptance: true,
        },
        {
          label: rate > 0 ? `Entrega (2/2 · ${rate}% OFF)` : "Entrega (50%)",
          amount: amounts[1],
          dueDate: installmentDueDate(plan.startDate, plan.deliveryDate, 1, 2),
        },
      ];
    }
    return amounts.map((amount, idx) => ({
      label: rate > 0 ? `Parcela ${idx + 1}/${count} (${rate}% OFF)` : `Parcela ${idx + 1}/${count} (sem juros)`,
      amount,
      dueDate: installmentDueDate(plan.startDate, plan.deliveryDate, idx, count),
      ...(idx === 0 ? { onAcceptance: true } : {}),
    }));
  }

  const pay = calcPaymentOptions(total);
  if (count === 1) {
    if (effectiveCondition === "cash") {
      // Regra KBOS: não aplica desconto automático à vista sem configuração explícita (applyCashDiscount === true).
      const useCashDiscount = plan.applyCashDiscount === true;
      return [
        {
          label: useCashDiscount ? "À vista (10% de desconto)" : "À vista",
          amount: useCashDiscount ? pay.cash : pay.card,
          dueDate: plan.startDate,
          onAcceptance: true,
        },
      ];
    }
    if (effectiveCondition === "card") {
      return [{ label: "Cartão", amount: pay.card, dueDate: plan.startDate, onAcceptance: true }];
    }
    return [{ label: "Parcela única (1x sem juros)", amount: pay.card, dueDate: plan.startDate, onAcceptance: true }];
  }

  const amounts = splitExactInstallments(total, count);
  if (count === 2 && effectiveCondition === "installments") {
    return [
      { label: "Entrada (50%)", amount: amounts[0], dueDate: plan.startDate, onAcceptance: true },
      { label: "Entrega (50%)", amount: amounts[1], dueDate: installmentDueDate(plan.startDate, plan.deliveryDate, 1, 2) },
    ];
  }

  return amounts.map((amount, idx) => ({
    label: `Parcela ${idx + 1}/${count} (sem juros)`,
    amount,
    dueDate: installmentDueDate(plan.startDate, plan.deliveryDate, idx, count),
    ...(idx === 0 ? { onAcceptance: true } : {}),
  }));
}

export type InterestFreeOption = {
  count: number;
  baseTotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  firstAmount: number;
  regularAmount: number;
  label: string;
  installments: Installment[];
};

/**
 * Gera os cenários de 1x até `maxInstallments` (padrão 4x) com soma de centavos exata.
 * Quando `progressiveDiscounts === true`, aplica a tabela progressiva sobre `baseTotal`:
 * 1x = 10% OFF, 2x = 6% OFF, 3x = 3% OFF, 4x = 0% OFF, sem nunca acumular descontos.
 */
export function buildInterestFreeOptions(
  baseTotal: number,
  startDate: string,
  deliveryDate: string,
  maxInstallments = 4,
  progressiveDiscounts = false,
): InterestFreeOption[] {
  const max = Math.max(1, Math.min(12, Math.trunc(maxInstallments)));
  const cleanBase = Math.round(baseTotal * 100) / 100;
  return Array.from({ length: max }, (_, idx) => {
    const count = idx + 1;
    const discountPercent = progressiveDiscounts ? (PROGRESSIVE_DISCOUNT_RATES[count] ?? 0) : 0;
    const discountAmount = Math.round(cleanBase * (discountPercent / 100) * 100) / 100;
    const cleanTotal = Math.round((cleanBase - discountAmount) * 100) / 100;
    const amounts = splitExactInstallments(cleanTotal, count);
    const installments: Installment[] =
      count === 1
        ? [
            {
              label:
                discountPercent > 0
                  ? `À vista (1x · ${discountPercent}% de desconto)`
                  : "1x sem juros (valor integral)",
              amount: amounts[0],
              dueDate: startDate,
              onAcceptance: true,
            },
          ]
        : count === 2
          ? [
              {
                label: discountPercent > 0 ? `Entrada (1/2 · ${discountPercent}% OFF)` : "Entrada (50%)",
                amount: amounts[0],
                dueDate: startDate,
                onAcceptance: true,
              },
              {
                label: discountPercent > 0 ? `Entrega (2/2 · ${discountPercent}% OFF)` : "Entrega (50%)",
                amount: amounts[1],
                dueDate: installmentDueDate(startDate, deliveryDate, 1, 2),
              },
            ]
          : amounts.map((amount, i) => ({
              label:
                discountPercent > 0
                  ? `Parcela ${i + 1}/${count} (${discountPercent}% OFF)`
                  : `Parcela ${i + 1}/${count} (sem juros)`,
              amount,
              dueDate: installmentDueDate(startDate, deliveryDate, i, count),
              ...(i === 0 ? { onAcceptance: true } : {}),
            }));
    return {
      count,
      baseTotal: cleanBase,
      discountPercent,
      discountAmount,
      total: installmentsTotal(installments),
      firstAmount: amounts[0],
      regularAmount: amounts[amounts.length - 1],
      label:
        count === 1
          ? discountPercent > 0
            ? `À vista (1x · ${discountPercent}% OFF)`
            : "1x sem juros"
          : discountPercent > 0
            ? `${count}x (${discountPercent}% OFF)`
            : `${count}x sem juros`,
      installments,
    };
  });
}

/**
 * Taxas de referência do provedor de pagamento (Mercado Pago Checkout Pro / Cartão vs. Pix direto).
 * Regra KBOS: quando o parcelamento é "sem juros para a cliente", o valor cobrado à cliente é
 * sempre 100% igual ao valor contratado; eventual taxa de intermediação/antecipação do gateway
 * é custo operacional interno assumido pelo vendedor.
 */
export const DEFAULT_CARD_PROVIDER_FEES: Record<number, number> = {
  1: 4.98,
  2: 6.5,
  3: 7.99,
  4: 9.49,
};

export type ProviderFeeBreakdown = {
  method: "pix_direct" | "card_gateway";
  supportsUpTo4xInterestFree: true;
  installmentsCount: number;
  clientChargedTotal: number;
  clientInstallments: number[];
  providerFeePercent: number;
  sellerAbsorbedCost: number;
  sellerNetReceived: number;
};

export function calcProviderFeeBreakdown(
  total: number,
  installmentsCount: number,
  condition: string | null | undefined,
  customFeePercent?: number,
): ProviderFeeBreakdown {
  const count = Math.max(1, Math.min(12, Math.trunc(installmentsCount || 1)));
  const clientChargedTotal = Math.round(total * 100) / 100;
  const clientInstallments = splitExactInstallments(clientChargedTotal, count);
  const isCard = condition === "card";
  const providerFeePercent =
    customFeePercent != null && Number.isFinite(customFeePercent) && customFeePercent >= 0
      ? customFeePercent
      : isCard
        ? (DEFAULT_CARD_PROVIDER_FEES[count] ?? 9.49)
        : 0;
  const sellerAbsorbedCost = Math.round(clientChargedTotal * (providerFeePercent / 100) * 100) / 100;
  const sellerNetReceived = Math.round((clientChargedTotal - sellerAbsorbedCost) * 100) / 100;
  return {
    method: isCard ? "card_gateway" : "pix_direct",
    supportsUpTo4xInterestFree: true,
    installmentsCount: count,
    clientChargedTotal,
    clientInstallments,
    providerFeePercent,
    sellerAbsorbedCost,
    sellerNetReceived,
  };
}

export function plannedTasks(plan: SalePlan) {
  return SERVICE_TEMPLATES[plan.service].map((title, index) => ({ title, dueDate: index === 0 ? plan.startDate : plan.deliveryDate }));
}

export function reminderOffset(dueDate: string, now = new Date()): 0 | 2 | null {
  const today = new Date(`${localDay(now)}T12:00:00Z`).getTime();
  const delta = (new Date(`${dueDate}T12:00:00Z`).getTime() - today) / 86_400_000;
  return delta === 0 || delta === 2 ? delta : null;
}
