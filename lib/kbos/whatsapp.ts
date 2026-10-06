// Camada de notificações (Módulo 4).
// Provider via Evolution API quando configurado; sem credenciais, a mensagem
// fica registrada como `pendente` na fila (outbox) — nada se perde.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { notifications, projects, users } from "./schema";

export async function queueWhatsApp(destino: string, mensagem: string, evento?: string) {
  const d = db();
  const rows = await d
    .insert(notifications)
    .values({ canal: "whatsapp", destino, mensagem, evento })
    .returning({ id: notifications.id });
  const id = rows[0].id;
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!base || !key || !instance) return { queued: true, id, sent: false };
  try {
    const res = await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ number: destino, text: mensagem }),
    });
    if (!res.ok) throw new Error(`Evolution ${res.status}: ${await res.text()}`);
    await d.update(notifications).set({ status: "enviado" }).where(eq(notifications.id, id));
    return { queued: true, id, sent: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await d.update(notifications).set({ status: "falha", erro }).where(eq(notifications.id, id));
    return { queued: true, id, sent: false, erro };
  }
}

/** Dispara (sem nunca quebrar a operação principal) para o cliente do projeto. */
export async function notifyProject(projectId: string, evento: string, mensagem: string) {
  try {
    const d = db();
    const proj = (await d.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0];
    if (!proj?.clienteId) return null;
    const cli = (await d.select().from(users).where(eq(users.id, proj.clienteId)).limit(1))[0];
    if (!cli?.phone) return null;
    return await queueWhatsApp(cli.phone, `*KBOS — ${proj.titulo}*\n${mensagem}`, evento);
  } catch (e) {
    console.error("[KBOS whatsapp]", e);
    return null;
  }
}
