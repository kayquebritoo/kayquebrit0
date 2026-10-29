// Acesso do cliente a um projeto: o titular (`projects.clienteId`) ou alguém com acesso compartilhado
// (`kbos_project_members`, ex.: a equipe de marketing do cliente). Toda checagem de cliente passa por aqui.
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { contacts, projectMembers, projects, users } from "./schema";
import { normalizePhone } from "./phone";

/** Empresas com acesso ativo da pessoa, incluindo as empresas dos grupos a que ela tem acesso (0031). */
const companyIdsSql = (userId: string) => sql`(SELECT co.id FROM kbos_companies co WHERE co.id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL)
    OR co.parent_id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL))`;

/** Projeto ativo: em andamento (não entregue) ou contrato recorrente, que segue ativo enquanto vale. */
export const activeProject = sql`(${projects.recurring} OR ${projects.status} <> 'entregue')`;

/** Condição SQL: projetos que o cliente pode ver. Regra: só projetos ATIVOS com vínculo explícito
 * (titular, acesso compartilhado, acesso ao principal — ex.: Grupo VIP → operações — ou acesso à empresa dada pelo admin).
 * Sem projeto ativo vinculado, o cliente não vê nada; ser contato/lead no CRM ou da mesma empresa não dá acesso. */
export function clientProjects(userId: string) {
  const direct = sql`(SELECT ${projects.id} FROM ${projects} WHERE ${projects.clienteId} = ${userId}
    UNION SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${userId})`;
  return and(activeProject, or(
    eq(projects.clienteId, userId),
    sql`${projects.id} IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${userId})`,
    sql`${projects.parentId} IN ${direct}`,
    sql`${projects.companyId} IN ${companyIdsSql(userId)}`,
  ))!;
}

/** O que o cliente vê de um projeto. Lista fechada: valor, orçamento, briefing, contato e titular ficam só com a equipe. */
export function clientProjectView(p: typeof projects.$inferSelect) {
  return {
    id: p.id, titulo: p.titulo, categoria: p.categoria, status: p.status, prazo: p.prazo,
    recurring: p.recurring, parentId: p.parentId, coverUrl: p.coverUrl, thumbUrl: p.thumbUrl, updatedAt: p.updatedAt,
  };
}

export async function clientProjectIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: projects.id }).from(projects).where(clientProjects(userId));
  return rows.map((r) => r.id);
}

export const MEMBER_ACCESS = ["acompanhar", "gestao"] as const;
export type MemberAccess = (typeof MEMBER_ACCESS)[number];

/** Projetos em que a pessoa faz a gestão do conteúdo (gerente de marketing): vê tudo, planeja e roteiriza. */
export async function managedProjectIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: projectMembers.projectId }).from(projectMembers).where(and(eq(projectMembers.userId, userId), eq(projectMembers.access, "gestao")));
  // gestão na empresa (0031) vale para os projetos dela e das empresas do grupo
  const byCompany = await db().select({ id: projects.id }).from(projects).where(sql`${projects.companyId} IN (SELECT co.id FROM kbos_companies co
    WHERE co.id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL AND a.role = 'gestao')
       OR co.parent_id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL AND a.role = 'gestao'))`);
  if (!rows.length && !byCompany.length) return [];
  const ids = [...rows.map((r) => r.id), ...byCompany.map((r) => r.id)];
  // gestão no principal vale para as operações dele; só projetos ativos
  const live = await db().select({ id: projects.id }).from(projects)
    .where(and(activeProject, or(inArray(projects.id, ids), inArray(projects.parentId, ids))));
  return [...new Set(live.map((k) => k.id))];
}

export async function isClientOfProject(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db().select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), clientProjects(userId))).limit(1);
  return !!row;
}

/** Projetos de que a pessoa é titular: `clienteId` ou papel "titular" na empresa (0031). Só o titular vê cobranças. */
export async function ownedProjectIds(userId: string, among: string[]): Promise<string[]> {
  if (!among.length) return [];
  const rows = await db().select({ id: projects.id }).from(projects).where(and(inArray(projects.id, among), or(
    eq(projects.clienteId, userId),
    sql`${projects.companyId} IN (SELECT co.id FROM kbos_companies co
      WHERE co.id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL AND a.role = 'titular')
         OR co.parent_id IN (SELECT a.company_id FROM kbos_company_access a WHERE a.user_id = ${userId} AND a.revoked_at IS NULL AND a.role = 'titular'))`,
  )));
  return rows.map((r) => r.id);
}

/** Clientes avisados sobre o projeto (chat, etapa): titular e acesso compartilhado, do projeto e do principal dele. Cobrança segue só para o titular. */
export async function projectClientUsers(projectId: string) {
  return db()
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(sql`${users.id} IN (SELECT ${projects.clienteId} FROM ${projects} WHERE ${projects.id} = ${projectId} OR ${projects.id} = (SELECT p2.parent_id FROM kbos_projects p2 WHERE p2.id = ${projectId})
      UNION SELECT ${projectMembers.userId} FROM ${projectMembers} WHERE ${projectMembers.projectId} = ${projectId} OR ${projectMembers.projectId} = (SELECT p3.parent_id FROM kbos_projects p3 WHERE p3.id = ${projectId}))`);
}

export async function listProjectMembers(projectId: string) {
  return db()
    .select({ userId: users.id, name: users.name, email: users.email, access: projectMembers.access, since: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

/** Contas de cliente da mesma empresa do projeto (pelo contato ou pelo título) que ainda não veem o projeto. */
export async function suggestProjectMembers(projectId: string) {
  const [p] = await db()
    .select({ clienteId: projects.clienteId, titulo: projects.titulo, company: contacts.company })
    .from(projects)
    .leftJoin(contacts, eq(contacts.id, projects.contactId))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) return [];
  const names = [p.company, p.titulo].map((x) => (x || "").trim().toLowerCase()).filter(Boolean);
  if (!names.length) return [];
  return db()
    .selectDistinct({ userId: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(contacts, sql`lower(${contacts.email}) = lower(${users.email})`)
    .where(and(
      eq(users.role, "cliente"),
      sql`lower(trim(${contacts.company})) IN (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`,
      sql`${users.id} IS DISTINCT FROM ${p.clienteId}`,
      sql`${users.id} NOT IN (SELECT ${projectMembers.userId} FROM ${projectMembers} WHERE ${projectMembers.projectId} = ${projectId})`,
    ))
    .limit(10);
}

export type MemberResult =
  | { ok: true; userId: string; name: string; email: string; phone: string | null; created: boolean }
  | { ok: false; error: string; needsName?: boolean };

export type MemberCandidate = { email: string; name: string; company: string | null; hasAccount: boolean };

/** Busca no painel do projeto: contas do portal e contatos do CRM (com e-mail) por nome, e-mail ou empresa. */
export async function searchMemberCandidates(qRaw: string): Promise<MemberCandidate[]> {
  const q = qRaw.trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const [accounts, people] = await Promise.all([
    db().select({ email: users.email, name: users.name }).from(users)
      .where(and(eq(users.role, "cliente"), sql`(lower(${users.email}) LIKE ${like} OR lower(${users.name}) LIKE ${like})`)).limit(8),
    db().select({ email: contacts.email, name: contacts.name, company: contacts.company }).from(contacts)
      .where(and(sql`coalesce(${contacts.email}, '') <> ''`, sql`(lower(${contacts.email}) LIKE ${like} OR lower(${contacts.name}) LIKE ${like} OR lower(coalesce(${contacts.company}, '')) LIKE ${like})`)).limit(12),
  ]);
  const byEmail = new Map<string, MemberCandidate>();
  for (const a of accounts) byEmail.set(a.email.toLowerCase(), { email: a.email.toLowerCase(), name: a.name, company: null, hasAccount: true });
  for (const c of people) {
    const email = (c.email || "").trim().toLowerCase();
    const prev = byEmail.get(email);
    if (prev) { prev.company ??= c.company; continue; }
    byEmail.set(email, { email, name: c.name, company: c.company, hasAccount: false });
  }
  // quem já tem conta pode ser contato com e-mail diferente em caixa: confere de uma vez
  const pending = [...byEmail.values()].filter((m) => !m.hasAccount).map((m) => m.email);
  if (pending.length) {
    const found = await db().select({ email: users.email }).from(users).where(sql`lower(${users.email}) IN (${sql.join(pending.map((e) => sql`${e}`), sql`, `)})`);
    for (const f of found) { const m = byEmail.get(f.email.toLowerCase()); if (m) m.hasAccount = true; }
  }
  return [...byEmail.values()].slice(0, 10);
}

/** Garante a conta de cliente do e-mail: usa a conta existente; senão cria a partir do contato do CRM;
 * senão (pessoa nova) cria contato + conta com o nome informado. */
async function ensureClientAccount(email: string, extra: { name?: string; phone?: string; company?: string | null }) {
  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (user) return { user, created: false };
  const [contact] = await db().select().from(contacts)
    .where(sql`lower(trim(${contacts.email})) = ${email} OR ${contacts.extraEmails} @> ${JSON.stringify([email])}::jsonb`).limit(1);
  const name = (extra.name || contact?.name || "").trim();
  if (!name) return null;
  const phone = normalizePhone(extra.phone || contact?.phone);
  if (!contact) await db().insert(contacts).values({ name, email, phone: extra.phone?.trim() || null, company: extra.company?.trim() || null, status: "client", source: "projeto" });
  const [createdUser] = await db().insert(users).values({ email, name, role: "cliente", phone }).returning();
  return { user: createdUser, created: true };
}

/** Admin dá acesso compartilhado ao projeto. Sem conta ainda, cria na hora (a partir do CRM ou com nome/WhatsApp informados). */
export async function addProjectMember(projectId: string, emailRaw: string, access?: MemberAccess, extra: { name?: string; phone?: string } = {}): Promise<MemberResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Informe um e-mail válido (o login usa o e-mail)." };
  const [project] = await db()
    .select({ id: projects.id, clienteId: projects.clienteId, company: contacts.company })
    .from(projects).leftJoin(contacts, eq(contacts.id, projects.contactId))
    .where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "Projeto não encontrado." };
  const ensured = await ensureClientAccount(email, { ...extra, company: project.company });
  if (!ensured) return { ok: false, needsName: true, error: "Esse e-mail ainda não está no CRM. Informe o nome para criar o acesso." };
  const { user, created } = ensured;
  if (user.role !== "cliente") return { ok: false, error: "Essa conta é da equipe; a equipe já vê todos os projetos." };
  if (project.clienteId === user.id) return { ok: false, error: "Essa pessoa já é a titular do projeto." };
  // sem nível explícito, adicionar de novo não rebaixa quem já faz a gestão
  const insert = db().insert(projectMembers).values({ projectId, userId: user.id, access: access ?? "acompanhar" });
  await (access ? insert.onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { access } }) : insert.onConflictDoNothing());
  return { ok: true, userId: user.id, name: user.name, email: user.email, phone: user.phone, created };
}

export async function setMemberAccess(projectId: string, userId: string, access: MemberAccess) {
  const rows = await db().update(projectMembers).set({ access }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning({ id: projectMembers.id });
  return rows.length > 0;
}

export async function removeProjectMember(projectId: string, userId: string) {
  const rows = await db().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning({ id: projectMembers.id });
  return rows.length > 0;
}
