// Empresas do cliente (marca/operação) e acesso por empresa. Acesso ao grupo (ex.: Grupo VIP) vale para as
// empresas dele (Hotel, Lounge, Praça). Revogar grava `revoked_at`; conta desativada derruba todas as sessões.
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import { COMPANY_ROLES, companies, companyAccess, projects, sessions, users, type CompanyRole } from "./schema";
import { PublicError } from "./http";

export { COMPANY_ROLES };
export type { CompanyRole };

export function slugify(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "empresa";
}

/** Pasta do Lume: só letras, números, espaço, hífen, ponto e sublinhado (vai para o caminho de busca do Lume). */
const LUME_PASTA = /^[\p{L}\p{N} ._-]{1,80}$/u;
const cleanPasta = (v: string | null | undefined) => {
  const p = (v ?? "").trim();
  if (!p) return null;
  if (!LUME_PASTA.test(p)) throw new PublicError("Pasta do Lume inválida: use só letras, números, espaço, hífen e ponto.");
  return p;
};

async function checkParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return null;
  if (parentId === selfId) throw new PublicError("A empresa não pode ser grupo dela mesma.");
  const [parent] = await db().select({ parentId: companies.parentId }).from(companies).where(eq(companies.id, parentId)).limit(1);
  if (!parent) throw new PublicError("Grupo não encontrado.", 404);
  if (parent.parentId) throw new PublicError("Esse grupo já é uma empresa de outro grupo; escolha o grupo principal.");
  if (selfId) {
    const [kid] = await db().select({ id: companies.id }).from(companies).where(eq(companies.parentId, selfId)).limit(1);
    if (kid) throw new PublicError("Esta empresa já é um grupo; ela não pode ficar dentro de outro.");
  }
  return parentId;
}

export type CompanyInput = { name: string; parentId?: string | null; contactId?: string | null; lumePasta?: string | null; brandPlanId?: string | null };

export async function createCompany(input: CompanyInput) {
  const name = input.name.trim();
  if (name.length < 2) throw new PublicError("Informe o nome da empresa.");
  const parentId = await checkParent(input.parentId);
  const base = slugify(name);
  // slug único: "hotel", "hotel-2"…
  const taken = new Set((await db().select({ slug: companies.slug }).from(companies).where(sql`${companies.slug} = ${base} OR ${companies.slug} LIKE ${base + "-%"}`)).map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const [row] = await db().insert(companies).values({
    name, slug, parentId, contactId: input.contactId || null, lumePasta: cleanPasta(input.lumePasta), brandPlanId: input.brandPlanId || null,
  }).returning();
  return row;
}

export async function updateCompany(id: string, patch: Partial<CompanyInput>) {
  const set: Partial<typeof companies.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    if (patch.name.trim().length < 2) throw new PublicError("Informe o nome da empresa.");
    set.name = patch.name.trim();
  }
  if (patch.parentId !== undefined) set.parentId = await checkParent(patch.parentId, id);
  if (patch.contactId !== undefined) set.contactId = patch.contactId || null;
  if (patch.lumePasta !== undefined) set.lumePasta = cleanPasta(patch.lumePasta);
  if (patch.brandPlanId !== undefined) set.brandPlanId = patch.brandPlanId || null;
  const [row] = await db().update(companies).set(set).where(eq(companies.id, id)).returning();
  if (!row) throw new PublicError("Empresa não encontrada.", 404);
  return row;
}

export async function listCompanies() {
  const rows = await db().select().from(companies).orderBy(asc(companies.name));
  const access = await db()
    .select({ companyId: companyAccess.companyId, userId: users.id, name: users.name, email: users.email, role: companyAccess.role, revokedAt: companyAccess.revokedAt, disabledAt: users.disabledAt })
    .from(companyAccess)
    .innerJoin(users, eq(users.id, companyAccess.userId))
    .orderBy(asc(companyAccess.createdAt));
  const linked = await db().select({ id: projects.id, titulo: projects.titulo, companyId: projects.companyId }).from(projects).where(sql`${projects.companyId} IS NOT NULL`);
  return rows.map((c) => ({
    ...c,
    access: access.filter((a) => a.companyId === c.id),
    projects: linked.filter((p) => p.companyId === c.id).map(({ id, titulo }) => ({ id, titulo })),
  }));
}

/** Liga (ou desliga, com `null`) um projeto a uma empresa. */
export async function setProjectCompany(projectId: string, companyId: string | null) {
  if (companyId) {
    const [c] = await db().select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!c) throw new PublicError("Empresa não encontrada.", 404);
  }
  const [row] = await db().update(projects).set({ companyId, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning({ id: projects.id });
  if (!row) throw new PublicError("Projeto não encontrado.", 404);
}

/** Dá (ou reativa/troca o papel de) acesso de uma conta de cliente já existente à empresa. */
export async function grantCompanyAccess(companyId: string, emailRaw: string, role: CompanyRole, grantedBy: string | null) {
  const email = emailRaw.trim().toLowerCase();
  const [company] = await db().select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) throw new PublicError("Empresa não encontrada.", 404);
  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user) throw new PublicError("Nenhuma conta com esse e-mail. Crie antes em CRM → ficha da pessoa → Acesso ao portal.", 404);
  if (user.role !== "cliente") throw new PublicError("Essa conta é da equipe; a equipe já vê todas as empresas.");
  const [row] = await db()
    .insert(companyAccess)
    .values({ companyId, userId: user.id, role, grantedBy })
    .onConflictDoUpdate({ target: [companyAccess.companyId, companyAccess.userId], set: { role, revokedAt: null, grantedBy } })
    .returning();
  return { ...row, name: user.name, email: user.email };
}

export async function revokeCompanyAccess(companyId: string, userId: string) {
  const rows = await db()
    .update(companyAccess)
    .set({ revokedAt: new Date() })
    .where(and(eq(companyAccess.companyId, companyId), eq(companyAccess.userId, userId), isNull(companyAccess.revokedAt)))
    .returning({ id: companyAccess.id });
  return rows.length > 0;
}

/** Desativa (derruba todas as sessões) ou reativa uma conta. Admin nunca é desativado por aqui. */
export async function setUserDisabled(userId: string, disabled: boolean) {
  const [user] = await db().select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new PublicError("Conta não encontrada.", 404);
  if (user.role === "admin") throw new PublicError("A conta de administrador não pode ser desativada por aqui.");
  await db().update(users).set({ disabledAt: disabled ? new Date() : null }).where(eq(users.id, userId));
  if (disabled) await db().delete(sessions).where(eq(sessions.userId, userId));
  return { userId, disabled };
}

/** Condição SQL: empresas que a pessoa acessa (acesso ativo à empresa ou ao grupo dela). */
export function accessibleCompanies(userId: string) {
  const direct = sql`(SELECT ${companyAccess.companyId} FROM ${companyAccess} WHERE ${companyAccess.userId} = ${userId} AND ${companyAccess.revokedAt} IS NULL)`;
  return or(sql`${companies.id} IN ${direct}`, sql`${companies.parentId} IN ${direct}`)!;
}

/** Ids das empresas acessíveis, no papel mais forte que a pessoa tem em cada uma (o do grupo vale para as empresas dele). */
export async function companyRolesFor(userId: string): Promise<Map<string, CompanyRole>> {
  const rows = await db()
    .select({ companyId: companyAccess.companyId, role: companyAccess.role })
    .from(companyAccess)
    .where(and(eq(companyAccess.userId, userId), isNull(companyAccess.revokedAt)));
  if (!rows.length) return new Map();
  const kids = await db().select({ id: companies.id, parentId: companies.parentId }).from(companies).where(inArray(companies.parentId, rows.map((r) => r.companyId)));
  const rank = (r: CompanyRole) => COMPANY_ROLES.length - COMPANY_ROLES.indexOf(r); // titular > gestao > acompanhar
  const out = new Map<string, CompanyRole>();
  const put = (id: string, role: CompanyRole) => { const cur = out.get(id); if (!cur || rank(role) > rank(cur)) out.set(id, role); };
  for (const r of rows) put(r.companyId, r.role);
  for (const k of kids) put(k.id, rows.find((r) => r.companyId === k.parentId)!.role);
  return out;
}

/** Pasta do Lume da empresa do projeto (ou do grupo dela). `undefined` = projeto sem empresa ou empresa sem pasta. */
export async function companyLumePasta(projectId: string): Promise<string | undefined> {
  const res = await db().execute(sql`SELECT COALESCE(c.lume_pasta, g.lume_pasta) AS pasta
    FROM kbos_projects p JOIN kbos_companies c ON c.id = p.company_id LEFT JOIN kbos_companies g ON g.id = c.parent_id
    WHERE p.id = ${projectId} LIMIT 1`);
  const pasta = res.rows[0]?.pasta;
  return typeof pasta === "string" && pasta ? pasta : undefined;
}

/** Pasta do Lume para o portal da pessoa: a primeira empresa acessível (projeto dela) que tem pasta definida. */
export async function clientLumeHub(userId: string): Promise<{ label: string; pasta: string } | null> {
  const res = await db().execute(sql`SELECT COALESCE(c.lume_pasta, g.lume_pasta) AS pasta, COALESCE(g.name, c.name) AS label
    FROM kbos_projects p JOIN kbos_companies c ON c.id = p.company_id LEFT JOIN kbos_companies g ON g.id = c.parent_id
    WHERE COALESCE(c.lume_pasta, g.lume_pasta) IS NOT NULL
      AND (p.cliente_id = ${userId}
        OR p.id IN (SELECT m.project_id FROM kbos_project_members m WHERE m.user_id = ${userId})
        OR c.id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL)
        OR c.parent_id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL))
    ORDER BY c.parent_id NULLS FIRST LIMIT 1`);
  const r = res.rows[0];
  return r && typeof r.pasta === "string" ? { label: String(r.label), pasta: r.pasta } : null;
}
