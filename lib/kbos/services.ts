// Catálogo de serviços — leitura/gravação no banco (servidor).
// Sem DATABASE_URL (build estático, dev) ou sem a tabela: devolve os padrões.
import { eq } from "drizzle-orm";
import { db } from "./db";
import { services } from "./schema";
import { mergeCatalog, type Override, type Service } from "./service-catalog";

export async function loadOverrides(): Promise<Override[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db().select().from(services);
    return rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      tagline: r.tagline,
      description: r.description,
      priceFrom: r.priceFrom,
      term: r.term,
      includes: r.includes,
      pitch: r.pitch,
      process: r.process,
      active: r.active,
    }));
  } catch (e) {
    console.error("[kbos] catálogo de serviços indisponível, usando padrões:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Todos os serviços (inclui inativos só se pedido). */
export async function listServices(opts: { includeInactive?: boolean } = {}): Promise<Service[]> {
  const all = mergeCatalog(await loadOverrides());
  return opts.includeInactive ? all : all.filter((s) => s.active);
}

export async function getService(slug: string): Promise<Service | undefined> {
  return (await listServices({ includeInactive: true })).find((s) => s.id === slug);
}

export type ServiceInput = {
  label?: string | null;
  tagline?: string | null;
  description?: string | null;
  priceFrom?: number | null;
  term?: string | null;
  includes?: string[] | null;
  pitch?: string[] | null;
  process?: { title: string; desc: string }[] | null;
  active?: boolean;
};

export async function saveService(slug: string, v: ServiceInput) {
  const values = {
    label: v.label ?? null,
    tagline: v.tagline ?? null,
    description: v.description ?? null,
    priceFrom: v.priceFrom === null || v.priceFrom === undefined ? null : String(v.priceFrom),
    term: v.term ?? null,
    includes: v.includes && v.includes.length ? v.includes : null,
    pitch: v.pitch && v.pitch.length ? v.pitch : null,
    process: v.process && v.process.length ? v.process : null,
    active: v.active ?? true,
    updatedAt: new Date(),
  };
  await db().insert(services).values({ slug, ...values }).onConflictDoUpdate({ target: services.slug, set: values });
}

export async function resetService(slug: string) {
  await db().delete(services).where(eq(services.slug, slug));
}
