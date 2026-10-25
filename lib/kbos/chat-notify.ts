// Aviso por WhatsApp quando chega mensagem no chat do projeto: no máximo 1 a cada 30 min por
// projeto e pessoa (o aviso anterior fica em kbos_notifications com evento `chat:<projeto>:<pessoa>`).
import { and, eq, gt, ne } from "drizzle-orm";
import { db } from "./db";
import { notifications, projects, users } from "./schema";
import { queueWhatsApp } from "./whatsapp";
import { projectClientUsers } from "./project-members";

export const CHAT_NOTIFY_WINDOW_MS = 30 * 60 * 1000;

export async function notifyChatMessage(author: { id: string; role: string; name: string }, projectId: string): Promise<number> {
  try {
    const [proj] = await db().select({ titulo: projects.titulo }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!proj) return 0;
    // Cliente escreveu → avisa os admins; equipe escreveu → avisa os clientes do projeto (titular e acesso compartilhado).
    const recipients = author.role === "cliente"
      ? await db().select({ id: users.id, phone: users.phone }).from(users).where(and(eq(users.role, "admin"), ne(users.id, author.id)))
      : await projectClientUsers(projectId);
    let sent = 0;
    const since = new Date(Date.now() - CHAT_NOTIFY_WINDOW_MS);
    for (const r of recipients) {
      if (!r.phone) continue;
      const evento = `chat:${projectId}:${r.id}`;
      const recent = await db().select({ id: notifications.id }).from(notifications).where(and(eq(notifications.evento, evento), gt(notifications.createdAt, since))).limit(1);
      if (recent.length) continue;
      const text = author.role === "cliente"
        ? `*KBOS — ${proj.titulo}*\n${author.name} mandou uma mensagem no chat do projeto. Responda pelo painel (Projetos → Conversa do projeto).`
        : `*KBOS — ${proj.titulo}*\nVocê tem uma mensagem nova da equipe no chat do projeto. Abra o portal para responder.`;
      await queueWhatsApp(r.phone, text, evento);
      sent++;
    }
    return sent;
  } catch (e) {
    console.error("[KBOS chat-notify]", e);
    return 0;
  }
}
