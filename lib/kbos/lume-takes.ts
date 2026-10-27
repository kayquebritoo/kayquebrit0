// Seleção de takes do Lume para um conteúdo do calendário (portal e equipe).
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { contacts, projects } from "./schema";
import { hubFor } from "./client-hubs";
import { LUME_ONLINE_DEFAULT, lumeClientCookie, toTakes } from "./lume";
import { clientProjects } from "./project-members";
import { companyLumePasta } from "./companies";

/** Pasta do Lume do projeto (pelo contato do projeto, cadastrado pelo admin). Cliente só nos projetos dele. */
export async function projectLumePasta(projectId: string, user: { id: string; role: string }): Promise<string | null> {
  const where = user.role === "cliente" ? and(eq(projects.id, projectId), clientProjects(user.id)) : eq(projects.id, projectId);
  const [row] = await db().select({ titulo: projects.titulo, name: contacts.name, company: contacts.company }).from(projects).leftJoin(contacts, eq(contacts.id, projects.contactId)).where(where).limit(1);
  if (!row) return null;
  // Pasta definida pelo admin na empresa vale primeiro; a regra por nome fica só para projetos ainda sem empresa.
  return (await companyLumePasta(projectId)) ?? hubFor(row.name, row.company, row.titulo)?.pasta ?? null;
}

const lumeBase = () => (process.env.LUME_URL || LUME_ONLINE_DEFAULT).trim().replace(/\/+$/, "");
const lumeSecret = () => (process.env.LUME_API_TOKEN || "").trim();
export const lumeReady = () => lumeSecret().length > 0;

/** Busca no Lume como o cliente (o Lume força a pasta). Sem texto: os mais recentes da pasta. */
export async function searchTakes(pasta: string, q: string, opts: { sub?: string | null; tipo?: string | null } = {}) {
  const qs = new URLSearchParams({ p: pasta });
  if (opts.tipo === "video" || opts.tipo === "foto") qs.set("t", opts.tipo);
  if (q.trim()) qs.set("q", q.trim().slice(0, 200));
  const path = q.trim() ? `/buscar?${qs}` : `/catalogo?${qs}`;
  const res = await fetch(`${lumeBase()}${path}`, { headers: { cookie: lumeClientCookie(lumeSecret(), pasta) }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 503 ? "O Lume está ocupado; tente em alguns segundos." : `O Lume respondeu ${res.status}.`);
  // a empresa (ex.: Hotel) estreita aqui: o Lume troca qualquer "p" fora da pasta do cliente pela pasta dele
  const sub = norm(opts.sub ?? "");
  return toTakes(await res.json())
    .filter((t) => !sub || norm(t.caminho ?? "").includes(sub))
    .map((t) => ({ id: t.id, nome: t.nome, tipo: t.tipo, segundo: t.segundo, data: t.data }));
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export async function fetchThumb(pasta: string, id: number) {
  return fetch(`${lumeBase()}/thumb/${id}.jpg`, { headers: { cookie: lumeClientCookie(lumeSecret(), pasta) }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
}
