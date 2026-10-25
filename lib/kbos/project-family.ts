// Cliente principal + operações (ex.: Grupo VIP → Hotel, Lounge, Praça). Quem procura posts de um projeto
// principal procura na família inteira; post novo com empresa vai direto para a operação daquela empresa.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { projects } from "./schema";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Operação de uma empresa: o título da operação contém o nome da empresa ("Hotel" → "Hotel Atalaia VIP"). */
export function operationFor<T extends { id: string; titulo: string }>(children: T[], brand: string | null | undefined): T | null {
  const b = norm(brand ?? "");
  if (!b) return null;
  const hits = children.filter((c) => norm(c.titulo).split(/[^a-z0-9]+/).includes(b) || norm(c.titulo).includes(b));
  return hits.length === 1 ? hits[0] : null; // ambíguo fica no principal
}

export type Family = { rootId: string; ids: string[]; children: { id: string; titulo: string; postLimit: number | null; categoria: string }[]; route: (brand: string | null | undefined) => string };

/** Família de um projeto: ele mesmo e as operações dele. `route` diz onde gravar um post novo de uma empresa. */
export async function projectFamily(projectId: string): Promise<Family> {
  const children = await db().select({ id: projects.id, titulo: projects.titulo, postLimit: projects.postLimit, categoria: projects.categoria }).from(projects).where(eq(projects.parentId, projectId));
  return { rootId: projectId, ids: [projectId, ...children.map((c) => c.id)], children, route: (brand) => operationFor(children, brand)?.id ?? projectId };
}

/** Principal de um projeto (ele mesmo, se não for operação). */
export async function rootOf(projectId: string): Promise<string> {
  const [p] = await db().select({ parentId: projects.parentId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return p?.parentId ?? projectId;
}
