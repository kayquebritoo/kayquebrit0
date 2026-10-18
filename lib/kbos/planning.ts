import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { budgetSales, budgets, clientPlans, contacts, projects } from "./schema";
import { PublicError } from "./http";
import { readSale, tokenHash, validSaleToken } from "./sales";
import { canonicalAssets, canonicalProfile } from "./brand-assets";
import { companyProfileSchema, planDocumentSchema, planReviewSchema, publicationIssues, type PublicClientPlan } from "./planning-model";

export async function initialCompany(sale: Awaited<ReturnType<typeof readSale>>) {
  if (sale.companyProfile) return sale.companyProfile;
  const [row] = await db().select({ c: contacts }).from(budgets).leftJoin(contacts, eq(budgets.contactId, contacts.id)).where(eq(budgets.id, sale.budgetId)).limit(1);
  const c = row?.c;
  return companyProfileSchema.parse({ companyName: c?.company || sale.snapshot.clientName, contactName: c?.name || sale.snapshot.clientName,
    legalName: c?.legalName || "", document: c?.document || "", email: c?.email || "", phone: c?.phone || "",
    website: c?.website?.startsWith("https://") ? c.website : "", instagram: c?.instagram || "", address: c?.address || "", city: c?.city || "", state: c?.state || "", zip: c?.zipCode || "" });
}
export async function listClientPlans() {
  return db().select({ id: clientPlans.id, projectId: clientPlans.projectId, title: projects.titulo, status: clientPlans.status, version: clientPlans.version, updatedAt: clientPlans.updatedAt }).from(clientPlans).innerJoin(projects, eq(clientPlans.projectId, projects.id)).orderBy(desc(clientPlans.updatedAt));
}
export async function adminClientPlan(id: string) {
  const [row] = await db().select({ plan: clientPlans, sale: budgetSales, project: projects }).from(clientPlans)
    .innerJoin(budgetSales, eq(clientPlans.saleId, budgetSales.id)).innerJoin(projects, eq(clientPlans.projectId, projects.id)).where(eq(clientPlans.id, id)).limit(1);
  if (!row) throw new PublicError("Planejamento não encontrado.", 404);
  return row;
}
export async function saveClientPlan(id: string, revision: number, input: unknown) {
  const current = await adminClientPlan(id);
  const parsed = planDocumentSchema.safeParse(input);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message || "Confira os campos do planejamento.");
  const doc = parsed.data;
  doc.profile = await canonicalProfile(current.sale.budgetId, doc.profile);
  doc.assets = await canonicalAssets(current.sale.budgetId, doc.assets);
  const rows = await db().update(clientPlans).set({ draft: doc, draftRevision: sql`${clientPlans.draftRevision} + 1`, updatedAt: new Date() })
    .where(and(eq(clientPlans.id, id), eq(clientPlans.draftRevision, revision))).returning();
  if (!rows[0]) throw new PublicError("O planejamento mudou em outra janela. Atualize antes de salvar.", 409);
  return rows[0];
}
export async function publishClientPlan(id: string, revision: number) {
  const { plan } = await adminClientPlan(id);
  const issues = publicationIssues(plan.draft);
  if (issues.length) throw new PublicError(`Complete antes de publicar: ${issues.join(", ")}.`);
  const rows = await db().update(clientPlans).set({ published: plan.draft, version: sql`${clientPlans.version} + 1`, status: "review", approvedAt: null, updatedAt: new Date() })
    .where(and(eq(clientPlans.id, id), eq(clientPlans.draftRevision, revision), eq(clientPlans.version, plan.version))).returning();
  if (!rows[0]) throw new PublicError("O planejamento mudou. Atualize antes de publicar.", 409);
  return rows[0];
}
async function planAccess(token: string) {
  if (!validSaleToken(token)) throw new PublicError("Link não encontrado.",404);
  const [shared] = await db().select({plan:clientPlans,sale:budgetSales}).from(clientPlans).innerJoin(budgetSales,eq(clientPlans.saleId,budgetSales.id)).where(eq(clientPlans.shareTokenHash,tokenHash(token))).limit(1);
  if(shared) return shared;
  const sale = await readSale(token);
  if(!sale.acceptedAt) throw new PublicError("O planejamento será criado depois do aceite da proposta.",409);
  const [plan] = await db().select().from(clientPlans).where(eq(clientPlans.saleId,sale.id)).limit(1);
  if(!plan) throw new PublicError("Planejamento ainda não disponível para esta proposta.",404);
  return {sale,plan};
}
export async function shareClientPlan(id: string) {
  await adminClientPlan(id);
  const token=randomBytes(32).toString("hex");
  await db().update(clientPlans).set({shareTokenHash:tokenHash(token)}).where(eq(clientPlans.id,id));
  return `/planejamento/${token}/`;
}
export async function publicClientPlan(token: string): Promise<PublicClientPlan> {
  const {sale,plan} = await planAccess(token);
  return { title: plan.published?.title || sale.snapshot.title, profile: plan.published?.profile || plan.signedProfile,
    document: plan.published, version: plan.version, status: plan.status, feedback: plan.feedback, approvedAt: plan.approvedAt?.toISOString() || null,
    startDate: sale.plan.startDate, endDate: sale.plan.deliveryDate };
}
export async function reviewClientPlan(token: string, input: unknown) {
  const parsed = planReviewSchema.safeParse(input);
  if (!parsed.success) throw new PublicError("Informe seu nome, a versão e sua confirmação ou comentário.");
  const data = parsed.data;
  const {sale} = await planAccess(token);
  const entry = { kind: data.action === "approve" ? "approval" : "feedback", name: data.name, section: data.action === "feedback" ? data.section : "geral",
    message: data.action === "feedback" ? data.message : "Planejamento aprovado pelo cliente.", version: data.version, at: new Date().toISOString() };
  const approve = data.action === "approve";
  const result = await db().execute(sql`UPDATE kbos_client_plans SET
    status = ${approve ? "approved" : "changes"}, approved_at = ${approve ? sql`now()` : sql`NULL`},
    feedback = feedback || ${JSON.stringify([entry])}::jsonb, updated_at = now()
    WHERE sale_id = ${sale.id}::uuid AND version = ${data.version} AND published IS NOT NULL
      AND (${!approve} OR status <> 'approved') RETURNING id`);
  if (!result.rows.length) {
    const current = await publicClientPlan(token);
    if (approve && current.version === data.version && current.status === "approved") return current;
    throw new PublicError("Uma nova versão está disponível. Atualize a página antes de validar.", 409);
  }
  return publicClientPlan(token);
}
export async function planningFile(token: string, fileId: string) {
  const {sale} = await planAccess(token);
  const plan = await publicClientPlan(token);
  const assets = plan.document ? [...plan.document.assets, ...plan.document.profile.assets] : plan.profile.assets;
  if (!assets.some((a) => a.fileId === fileId)) throw new PublicError("Arquivo não encontrado.", 404);
  return budgetFile(sale.budgetId, fileId);
}
export async function budgetFile(budgetId: string, fileId: string) {
  const result = await db().execute(sql`SELECT name, mime, encode(content, 'base64') AS data FROM kbos_budget_uploads WHERE id = ${fileId}::uuid AND budget_id = ${budgetId}::uuid`);
  const row = result.rows[0];
  if (!row) throw new PublicError("Arquivo não encontrado.", 404);
  return { name: String(row.name), mime: String(row.mime), bytes: Buffer.from(String(row.data), "base64") };
}
export function downloadResponse(file: { name: string; mime: string; bytes: Buffer }, preview = false) {
  const inline = preview && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mime);
  return new Response(new Uint8Array(file.bytes), { headers: {
    "Content-Type": file.mime, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer",
  } });
}
