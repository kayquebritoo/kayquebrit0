import { sql } from "drizzle-orm";
import { db } from "./db";
import { PublicError } from "./http";
import { companyProfileSchema, type BrandAsset, type CompanyProfile } from "./planning-model";
import { documentKind } from "./document";

export async function canonicalAssets(budgetId: string, assets: BrandAsset[], clientOnly = false): Promise<BrandAsset[]> {
  return Promise.all(assets.map(async (a) => {
    const result = await db().execute(sql`SELECT name, mime, size, sha256, source FROM kbos_budget_uploads WHERE id = ${a.fileId}::uuid AND budget_id = ${budgetId}::uuid`);
    const file = result.rows[0];
    if (!file || (clientOnly && file.source !== "client")) throw new PublicError("Um dos arquivos não pertence aos materiais enviados para esta proposta.", 400);
    return { fileId: a.fileId, category: a.category, name: String(file.name), mime: String(file.mime), size: Number(file.size), sha256: String(file.sha256) };
  }));
}
export async function canonicalProfile(budgetId: string, input: unknown, clientOnly = false): Promise<CompanyProfile> {
  const parsed = companyProfileSchema.safeParse(input);
  if (!parsed.success) throw new PublicError(parsed.error.issues[0]?.message || "Confira os dados da empresa.");
  const profile = parsed.data;
  if (!profile.companyName) throw new PublicError("Informe o nome da empresa.");
  if (profile.document && !documentKind(profile.document)) throw new PublicError("Confira o CPF/CNPJ informado.");
  profile.assets = await canonicalAssets(budgetId, profile.assets, clientOnly);
  if (profile.logoId && !profile.assets.some((a) => a.fileId === profile.logoId && a.category === "logo")) throw new PublicError("Selecione a logo entre os arquivos da marca.");
  return profile;
}
