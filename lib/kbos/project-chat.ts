// Chat do projeto (fase 1): cliente + equipe no mesmo grupo, por projeto.
// Regra de acesso: equipe (qualquer papel ≠ cliente) vê todos; cliente só o projeto onde é o `clienteId`.
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { chatMessages, chatReads, projects, users } from "./schema";

export const CHAT_MAX_LEN = 2000;
export type ChatActor = { id: string; role: string };

export async function canAccessProject(actor: ChatActor, projectId: string): Promise<boolean> {
  const [p] = await db().select({ clienteId: projects.clienteId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) return false;
  return actor.role !== "cliente" || p.clienteId === actor.id;
}

export function cleanBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (!body || body.length > CHAT_MAX_LEN) return null;
  return body;
}

export async function listMessages(projectId: string, limit = 200) {
  const rows = await db()
    .select({ id: chatMessages.id, body: chatMessages.body, createdAt: chatMessages.createdAt, authorId: chatMessages.authorId, authorName: users.name, authorRole: users.role })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.authorId))
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
  return rows;
}

export async function postMessage(actor: ChatActor, projectId: string, body: string) {
  const [row] = await db().insert(chatMessages).values({ projectId, authorId: actor.id, body }).returning();
  await markRead(actor.id, projectId);
  return row;
}

export async function markRead(userId: string, projectId: string) {
  const [cur] = await db().select().from(chatReads).where(and(eq(chatReads.projectId, projectId), eq(chatReads.userId, userId))).limit(1);
  if (cur) await db().update(chatReads).set({ lastReadAt: new Date() }).where(and(eq(chatReads.projectId, projectId), eq(chatReads.userId, userId)));
  else await db().insert(chatReads).values({ projectId, userId });
}

/** Mensagens de outras pessoas depois da última leitura, por projeto. */
export async function unreadByProject(userId: string, projectIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of projectIds) {
    const [r] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(chatMessages)
      .leftJoin(chatReads, and(eq(chatReads.projectId, chatMessages.projectId), eq(chatReads.userId, userId)))
      .where(and(eq(chatMessages.projectId, id), ne(chatMessages.authorId, userId), sql`${chatMessages.createdAt} > coalesce(${chatReads.lastReadAt}, 'epoch'::timestamptz)`));
    out[id] = r?.n ?? 0;
  }
  return out;
}
