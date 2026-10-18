import { z } from "zod";

const text = (max = 4000) => z.string().trim().max(max).default("");
const url = z.union([z.literal(""), z.url().max(2000).refine((v) => v.startsWith("https://"), "Use um endereço HTTPS.")]).default("");
export const brandAssetSchema = z.object({
  fileId: z.uuid(), name: z.string().max(200),
  category: z.enum(["logo", "vector", "pattern", "manual", "reference", "photo"]),
  mime: z.string().max(200).optional(), sha256: z.string().optional(), size: z.number().optional(),
});
export type BrandAsset = z.infer<typeof brandAssetSchema>;
export const companyProfileSchema = z.object({
  companyName: text(160), legalName: text(200), document: text(30), contactName: text(160),
  email: z.union([z.literal(""), z.email().max(160)]).default(""), phone: text(40),
  website: url, instagram: text(160), address: text(500), city: text(160), state: text(40), zip: text(20), segment: text(160), tagline: text(200),
  concept: text(), audience: text(), tone: text(), objective: text(),
  colors: z.array(z.object({ name: text(40), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.") })).max(12).default([]),
  logoId: z.uuid().nullable().default(null),
  assets: z.array(brandAssetSchema).max(30).default([]),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
const isoDay = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0,10) === v)]).default("");
export const planDocumentSchema = z.object({
  title: text(200), profile: companyProfileSchema,
  concept: text(), positioning: text(), audience: text(), tone: text(),
  typography: z.object({ heading: text(100), body: text(100), usage: text() }).default({ heading: "", body: "", usage: "" }),
  fivePs: z.object({ product: text(), price: text(), place: text(), promotion: text(), people: text() }),
  swot: z.object({ strengths: text(), weaknesses: text(), opportunities: text(), threats: text() }),
  goals: z.array(z.object({ title: text(300), metric: text(200), target: text(200), dueDate: isoDay })).max(30),
  editorial: z.array(z.object({ date: isoDay, title: text(300), channel: text(100), format: text(100), goal: text(500), cta: text(500) })).max(120),
  execution: z.array(z.object({ title: text(200), description: text(), date: isoDay })).max(30),
  guidelines: text(8000), assets: z.array(brandAssetSchema).max(50),
});
export type PlanDocument = z.infer<typeof planDocumentSchema>;
export type PlanReview = { kind: "feedback" | "approval"; section: string; message: string; name: string; at: string; version: number };
export type PublicClientPlan = {
  id?: string; title: string; profile: CompanyProfile; document: PlanDocument | null;
  version: number; status: string; feedback: PlanReview[]; approvedAt: string | null; startDate: string; endDate: string;
};
export function seedPlan(profile: CompanyProfile, title: string, scope: { service: string; description?: string | null }[], startDate: string, endDate: string): PlanDocument {
  return planDocumentSchema.parse({
    title: `Planejamento · ${profile.companyName || title}`, profile,
    concept: profile.concept, positioning: "", audience: profile.audience, tone: profile.tone,
    typography: {}, fivePs: { product: profile.segment }, swot: {},
    goals: profile.objective ? [{ title: profile.objective }] : [], editorial: [],
    execution: [{ title: "Alinhamento e validação", date: startDate, description: "Revisão da identidade, do escopo e do planejamento com o cliente." }, { title: "Entrega do ciclo contratado", date: endDate, description: `Escopo contratado: ${scope.map((i)=>i.service).join("; ") || title}. Conforme as condições da proposta assinada.` }],
    guidelines: "", assets: profile.assets,
  });
}
export function publicationIssues(doc: PlanDocument): string[] {
  const required = [[doc.profile.companyName, "Nome da empresa"], [doc.concept, "Conceito da marca"], [doc.positioning, "Posicionamento"], [doc.audience, "Público-alvo"], [doc.tone, "Tom de voz"]];
  const missing = required.filter(([value]) => !value?.trim()).map(([,label]) => label);
  if (!doc.profile.logoId) missing.push("Logo principal");
  if (!doc.typography.heading || !doc.typography.body) missing.push("Tipografia");
  if (!doc.profile.colors.length) missing.push("Paleta de cores");
  if (!doc.goals.some((g) => g.title.trim())) missing.push("Objetivos do planejamento");
  return missing;
}
export const planReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), version: z.number().int().positive(), name: z.string().trim().min(3).max(160), confirmed: z.literal(true) }),
  z.object({ action: z.literal("feedback"), version: z.number().int().positive(), name: z.string().trim().min(3).max(160), section: z.enum(["marca", "estrategia", "conteudo", "execucao", "geral"]), message: z.string().trim().min(3).max(4000) }),
]);
