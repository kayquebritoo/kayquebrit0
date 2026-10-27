// Acesso do cliente a um projeto: o titular (`projects.clienteId`) ou alguém com acesso compartilhado
// (`kbos_project_members`, ex.: a equipe de marketing do cliente). Toda checagem de cliente passa por aqui.
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import { contacts, projectMembers, projects, users } from "./schema";

/** Condição SQL: projetos que o cliente pode ver. Acesso ao principal (ex.: Grupo VIP) vale para as operações dele. */
export function clientProjects(userId: string) {
  const direct = sql`(SELECT ${projects.id} FROM ${projects} WHERE ${projects.clienteId} = ${userId}
    UNION SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${userId})`;
  return or(
    eq(projects.clienteId, userId),
    sql`${projects.id} IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${userId})`,
    sql`${projects.parentId} IN ${direct}`,
  )!;
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
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // gestão no principal vale para as operações dele
  const kids = await db().select({ id: projects.id }).from(projects).where(inArray(projects.parentId, ids));
  return [...new Set([...ids, ...kids.map((k) => k.id)])];
}

export async function isClientOfProject(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db().select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), clientProjects(userId))).limit(1);
  return !!row;
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

export type MemberResult = { ok: true; userId: string; name: string; email: string } | { ok: false; error: string };

/** Admin dá acesso compartilhado a uma conta de cliente já existente (criada em "Acesso ao portal"). */
export async function addProjectMember(projectId: string, emailRaw: string, access?: MemberAccess): Promise<MemberResult> {
  const email = emailRaw.trim().toLowerCase();
  const [project] = await db().select({ id: projects.id, clienteId: projects.clienteId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "Projeto não encontrado." };
  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user) return { ok: false, error: "Nenhuma conta com esse e-mail. Crie antes em CRM → ficha da pessoa → Acesso ao portal." };
  if (user.role !== "cliente") return { ok: false, error: "Essa conta é da equipe; a equipe já vê todos os projetos." };
  if (project.clienteId === user.id) return { ok: false, error: "Essa pessoa já é a titular do projeto." };
  // sem nível explícito, adicionar de novo não rebaixa quem já faz a gestão
  const insert = db().insert(projectMembers).values({ projectId, userId: user.id, access: access ?? "acompanhar" });
  await (access ? insert.onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { access } }) : insert.onConflictDoNothing());
  return { ok: true, userId: user.id, name: user.name, email: user.email };
}

export async function setMemberAccess(projectId: string, userId: string, access: MemberAccess) {
  const rows = await db().update(projectMembers).set({ access }).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning({ id: projectMembers.id });
  return rows.length > 0;
}

export async function removeProjectMember(projectId: string, userId: string) {
  const rows = await db().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning({ id: projectMembers.id });
  return rows.length > 0;
}
