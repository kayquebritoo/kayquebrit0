// Regras da venda conectada, compartilhadas entre painel e servidor.
import { z } from "zod";
import { companyProfileSchema } from "./planning-model";
import { calcPaymentOptions } from "./budget-calc";

export const SERVICE_TEMPLATES = {
  branding: ["Briefing e referências da marca", "Conceito e identidade visual", "Revisão com o cliente", "Manual de Identidade e arquivos finais"],
  site: ["Briefing e conteúdo", "Layout e aprovação", "Desenvolvimento e testes", "Publicação e entrega"],
  audiovisual: ["Briefing e roteiro", "Produção e captação", "Edição e revisão", "Entrega dos arquivos"],
  mensal: ["Planejamento do ciclo", "Produção do ciclo", "Revisão com o cliente", "Entrega e fechamento do ciclo"],
} as const;
export const SERVICE_LABELS = { branding: "Branding", site: "Site", audiovisual: "Audiovisual", mensal: "Plano mensal" } as const;

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
  z.object({ kind: z.literal("file"), fileId: z.uuid(), name: z.string().max(200), role: materialRole,
    sha256: z.string().optional(), size: z.number().optional() }),
  z.object({ kind: z.literal("link"), url: httpsUrl, name: z.string().trim().min(1).max(200), role: materialRole }),
]);
export type SaleMaterial = z.infer<typeof saleMaterialSchema>;

export const salePlanSchema = z.object({
  service: z.enum(["branding", "site", "audiovisual", "mensal"]),
  startDate: day,
  deliveryDate: day,
  months: z.number().int().min(1).max(36).default(1),
  manualUrl: z.union([httpsUrl, z.literal("")]).default(""),
  attachments: z.array(saleMaterialSchema).max(20).optional(),
  dealId: z.uuid().nullable().optional(),
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
  companyProfile: companyProfileSchema.optional(),
});
export type Installment = { label: string; amount: number; dueDate: string; onAcceptance?: boolean };
export const installmentsTotal = (items: Installment[]) => items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100;

export function paymentSchedule(total: number, condition: string | null, plan: SalePlan): Installment[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error("O orçamento precisa ter valor positivo.");
  if (plan.service === "mensal") {
    return Array.from({ length: plan.months }, (_, index) => {
      const [y, m] = plan.startDate.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1 + index, 5, 12));
      return { label: `Mensalidade ${index + 1}/${plan.months}`, amount: total, dueDate: index ? date.toISOString().slice(0, 10) : plan.startDate, onAcceptance: index === 0 };
    });
  }
  const pay = calcPaymentOptions(total);
  if (condition === "installments") return [
    { label: "Entrada (50%)", amount: pay.entry, dueDate: plan.startDate, onAcceptance: true },
    { label: "Entrega (50%)", amount: pay.balance, dueDate: plan.deliveryDate },
  ];
  if (condition !== "cash" && condition !== "card") throw new Error("Escolha a condição de pagamento no orçamento.");
  return [{ label: condition === "cash" ? "À vista (10% de desconto)" : "Cartão", amount: condition === "cash" ? pay.cash : pay.card, dueDate: plan.startDate, onAcceptance: true }];
}

export function plannedTasks(plan: SalePlan) {
  return SERVICE_TEMPLATES[plan.service].map((title, index) => ({ title, dueDate: index === 0 ? plan.startDate : plan.deliveryDate }));
}

export function reminderOffset(dueDate: string, now = new Date()): 0 | 2 | null {
  const today = new Date(`${localDay(now)}T12:00:00Z`).getTime();
  const delta = (new Date(`${dueDate}T12:00:00Z`).getTime() - today) / 86_400_000;
  return delta === 0 || delta === 2 ? delta : null;
}
