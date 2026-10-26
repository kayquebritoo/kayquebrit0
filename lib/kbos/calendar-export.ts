import { asc, inArray } from "drizzle-orm";
import { db } from "./db";
import { projects, socialPosts, postPublications } from "./schema";
import { projectFamily } from "./project-family";

/** Snapshot integral, sem o limite das listas: inclui registros ocultos e distribuição por rede. */
export async function calendarSnapshot(projectId: string) {
  const family = await projectFamily(projectId);
  const projectRows = await db().select().from(projects).where(inArray(projects.id, family.ids));
  if (!projectRows.length) throw new Error("Projeto não encontrado.");
  const posts = await db().select().from(socialPosts).where(inArray(socialPosts.projectId, family.ids)).orderBy(asc(socialPosts.scheduledAt), asc(socialPosts.id));
  const publications = posts.length ? await db().select().from(postPublications).where(inArray(postPublications.postId, posts.map(p => p.id))) : [];
  return { schema: "kbos-calendar-v1", exportedAt: new Date().toISOString(), timezone: "America/Belem", projectId, projects: projectRows, posts, publications };
}

/** CSV com proteção contra fórmulas e campos multilinha/citações preservados. */
export function calendarCsv(posts: { id: string; projectId: string | null; brand: string | null; title: string; format: string; scheduledAt: Date | null; status: string; script: string | null; caption: string | null; networks: string[]; linkedTo: string | null; dismissedAt: Date | null }[], month?: string) {
  const safe = (v: unknown) => { let s = String(v ?? ""); if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const rows = posts.filter(p => !p.linkedTo && !p.dismissedAt && (!month || p.scheduledAt?.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).startsWith(month)));
  return "\uFEFF" + [["ID", "Projeto", "Empresa", "Conteúdo", "Formato", "Data (Belém)", "Status", "Redes", "Roteiro", "Legenda"], ...rows.map(p => [p.id, p.projectId, p.brand, p.title, p.format, p.scheduledAt?.toLocaleString("sv-SE", { timeZone: "America/Belem" }), p.status, p.networks.join(", "), p.script, p.caption])].map(r => r.map(safe).join(";")).join("\r\n");
}
