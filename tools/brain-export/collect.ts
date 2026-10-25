// Leitura explícita, sem migrações e sem exportar documentos, contatos privados ou valores.
import { writeFile } from "node:fs/promises";
import { eq, and, gt, ne } from "drizzle-orm";
import { db } from "../../lib/kbos/db";
import { contacts, projects, tasks, clientPlans } from "../../lib/kbos/schema";

async function main() {
  if (process.env.KBOS_BRAIN_EXPORT_ENABLED !== "1") throw new Error("Exportação desativada");
  const output = process.argv[2];
  if (!output) throw new Error("Informe arquivo privado de destino");
  const result = await db().batch([
    db().select({ id: contacts.id, name: contacts.name, company: contacts.company, status: contacts.status, updatedAt: contacts.updatedAt }).from(contacts).where(eq(contacts.status, "cliente")),
    db().select({ id: projects.id, titulo: projects.titulo, categoria: projects.categoria, status: projects.status, prazo: projects.prazo, contactId: projects.contactId, updatedAt: projects.updatedAt }).from(projects),
    db().select({ id: tasks.id, titulo: tasks.titulo, status: tasks.status, dueAt: tasks.dueAt, projectId: tasks.projectId, priority: tasks.priority, updatedAt: tasks.updatedAt }).from(tasks),
    db().select({ id: clientPlans.id, projectId: clientPlans.projectId, version: clientPlans.version, status: clientPlans.status, approvedAt: clientPlans.approvedAt, updatedAt: clientPlans.updatedAt }).from(clientPlans).where(and(gt(clientPlans.version, 0), ne(clientPlans.status, "draft"))),
  ]);
  await writeFile(output, JSON.stringify({ version: 1, contacts: result[0], projects: result[1], tasks: result[2], plans: result[3] }), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ collected: result.map(rows => rows.length) }));
}

main().catch(() => { console.error("Não foi possível gerar o snapshot; nenhum dado ou segredo foi impresso."); process.exitCode = 1; });
