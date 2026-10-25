// Acesso do cliente a um projeto: o titular (`projects.clienteId`) ou alguém com acesso compartilhado
// (`kbos_project_members`, ex.: a equipe de marketing do cliente). Toda checagem de cliente passa por aqui.
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "./db";
import { projectMembers, projects, users } from "./schema";

/** Condição SQL: projetos que o cliente pode ver. */
export function clientProjects(userId: string) {
  return or(
    eq(projects.clienteId, userId),
    sql`${projects.id} IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${userId})`,
  )!;
}

export async function clientProjectIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: projects.id }).from(projects).where(clientProjects(userId));
  return rows.map((r) => r.id);
}

export async function isClientOfProject(projectId: string, userId: string): Promise<boolean> {
  const [row] = await db().select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), clientProjects(userId))).limit(1);
  return !!row;
}

/** Clientes avisados sobre o projeto (chat, etapa): titular e acesso compartilhado. Cobrança segue só para o titular. */
export async function projectClientUsers(projectId: string) {
  return db()
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(sql`${users.id} IN (SELECT ${projects.clienteId} FROM ${projects} WHERE ${projects.id} = ${projectId}
      UNION SELECT ${projectMembers.userId} FROM ${projectMembers} WHERE ${projectMembers.projectId} = ${projectId})`);
}

export async function listProjectMembers(projectId: string) {
  return db()
    .select({ userId: users.id, name: users.name, email: users.email, since: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt));
}

export type MemberResult = { ok: true; userId: string; name: string; email: string } | { ok: false; error: string };

/** Admin dá acesso compartilhado a uma conta de cliente já existente (criada em "Acesso ao portal"). */
export async function addProjectMember(projectId: string, emailRaw: string): Promise<MemberResult> {
  const email = emailRaw.trim().toLowerCase();
  const [project] = await db().select({ id: projects.id, clienteId: projects.clienteId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { ok: false, error: "Projeto não encontrado." };
  const [user] = await db().select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user) return { ok: false, error: "Nenhuma conta com esse e-mail. Crie antes em CRM → ficha da pessoa → Acesso ao portal." };
  if (user.role !== "cliente") return { ok: false, error: "Essa conta é da equipe; a equipe já vê todos os projetos." };
  if (project.clienteId === user.id) return { ok: false, error: "Essa pessoa já é a titular do projeto." };
  await db().insert(projectMembers).values({ projectId, userId: user.id }).onConflictDoNothing();
  return { ok: true, userId: user.id, name: user.name, email: user.email };
}

export async function removeProjectMember(projectId: string, userId: string) {
  const rows = await db().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning({ id: projectMembers.id });
  return rows.length > 0;
}
