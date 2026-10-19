// Cases do portfólio — leitura/gravação no banco (servidor).
// Sem DATABASE_URL ou com o banco fora do ar, o site continua mostrando os
// cases antigos do código (`lib/data.ts`).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { showcaseConsents, showcases } from "./schema";
import { PublicError } from "./http";
import { PROJECTS, type Project } from "../data";
import {
  canPublish,
  contentHash,
  neededScopes,
  SCOPES,
  SCOPE_LABELS,
  slugify,
  toPublicProject,
  type CaseRow,
  type ConsentState,
  type Scope,
  type Verdict,
} from "./showcase-model";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const CONSENT_DAYS = 14;

type DbShowcase = typeof showcases.$inferSelect;
type DbConsent = typeof showcaseConsents.$inferSelect;

export const toCase = (r: DbShowcase): CaseRow => ({
  slug: r.slug,
  title: r.title,
  status: r.status,
  basis: r.basis,
  service: r.service,
  category: r.category,
  clientName: r.clientName,
  clientLogo: r.clientLogo,
  year: r.year,
  description: r.description,
  longDescription: r.longDescription,
  about: r.about,
  img: r.img,
  gallery: r.gallery,
  videoLabel: r.videoLabel,
  videoId: r.videoId,
  siteUrl: r.siteUrl,
  metrics: r.metrics,
  testimonial: r.testimonial,
  testimonialAuthor: r.testimonialAuthor,
});

/** Autorização em vigor: a última decisão (concedida ou revogada). Pedido novo pendente não derruba a anterior. */
async function effectiveConsents(ids: string[]): Promise<Map<string, DbConsent>> {
  const out = new Map<string, DbConsent>();
  if (!ids.length) return out;
  const rows = await db()
    .select()
    .from(showcaseConsents)
    .where(and(inArray(showcaseConsents.showcaseId, ids), isNotNull(showcaseConsents.decidedAt), inArray(showcaseConsents.status, ["granted", "revoked"])))
    .orderBy(desc(showcaseConsents.decidedAt));
  for (const r of rows) if (!out.has(r.showcaseId)) out.set(r.showcaseId, r);
  return out;
}

const asState = (c: DbConsent | undefined): ConsentState =>
  c ? { status: c.status, grantedScopes: c.grantedScopes, contentHash: c.contentHash, expiresAt: c.expiresAt } : null;

/** Cases que o visitante vê: os do banco publicados com autorização válida + os antigos do código sem linha no banco. */
export async function listPublicCases(): Promise<Project[]> {
  if (!process.env.DATABASE_URL) return PROJECTS;
  try {
    const rows = await db().select().from(showcases);
    const taken = new Set(rows.map((r) => r.slug));
    const published = rows.filter((r) => r.status === "published");
    const consents = await effectiveConsents(published.map((r) => r.id));
    const live = published
      .filter((r) => canPublish(toCase(r), asState(consents.get(r.id))).ok)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .map((r) => toPublicProject(toCase(r)));
    return [...live, ...PROJECTS.filter((p) => !taken.has(p.slug))];
  } catch (e) {
    console.error("[kbos] cases indisponíveis, usando a lista do código:", e instanceof Error ? e.message : e);
    return PROJECTS;
  }
}

export async function getPublicCase(slug: string): Promise<Project | undefined> {
  return (await listPublicCases()).find((p) => p.slug === slug);
}

/* ---------------- admin ---------------- */

export type CaseAdmin = CaseRow & {
  id: string;
  projectId: string | null;
  contactId: string | null;
  publishedAt: string | null;
  needed: Scope[];
  consent: { status: string; grantedScopes: string[]; signerName: string | null; decidedAt: string | null } | null;
  pending: { expiresAt: string } | null;
  verdict: Verdict;
};

export async function listCasesAdmin(): Promise<CaseAdmin[]> {
  const rows = await db().select().from(showcases).orderBy(desc(showcases.updatedAt));
  const ids = rows.map((r) => r.id);
  const consents = await effectiveConsents(ids);
  const pend = ids.length
    ? await db().select().from(showcaseConsents).where(and(inArray(showcaseConsents.showcaseId, ids), eq(showcaseConsents.status, "pending")))
    : [];
  const now = Date.now();
  return rows.map((r) => {
    const c = consents.get(r.id);
    const p = pend.find((x) => x.showcaseId === r.id && x.expiresAt.getTime() > now);
    return {
      ...toCase(r),
      id: r.id,
      projectId: r.projectId,
      contactId: r.contactId,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      needed: neededScopes(toCase(r)),
      consent: c
        ? { status: c.status, grantedScopes: c.grantedScopes ?? [], signerName: c.signerName, decidedAt: c.decidedAt?.toISOString() ?? null }
        : null,
      pending: p ? { expiresAt: p.expiresAt.toISOString() } : null,
      verdict: canPublish(toCase(r), asState(c)),
    };
  });
}

const dupe = (e: unknown) => /duplicate|unique/i.test(e instanceof Error ? e.message : "");

/** Cases que ainda só existem no código do site (`lib/data.ts`) e não têm linha no banco. */
export async function legacyPending(): Promise<Project[]> {
  const rows = await db().select({ slug: showcases.slug }).from(showcases);
  const taken = new Set(rows.map((r) => r.slug));
  return PROJECTS.filter((p) => !taken.has(p.slug));
}

/** Traz os cases do site para o painel, já no ar e com o mesmo conteúdo (base "contrato": sem números/depoimento).
 * Não duplica: só cria o que ainda não tem linha com o mesmo slug. */
export async function importLegacyCases(): Promise<{ imported: string[] }> {
  const pending = await legacyPending();
  const now = new Date();
  const imported: string[] = [];
  for (const p of pending) {
    const row: CaseRow = {
      slug: p.slug, title: p.title, status: "published", basis: "contract", service: p.service,
      category: p.category, clientName: p.client, clientLogo: null, year: p.year, description: p.description,
      longDescription: p.longDescription, about: p.about, img: p.img, gallery: p.gallery, videoLabel: p.videoLabel,
      videoId: p.videoId ?? null, siteUrl: p.siteUrl ?? null, metrics: p.metrics ?? null,
      testimonial: p.testimonial?.text ?? null, testimonialAuthor: p.testimonial?.author ?? null,
    };
    // Com números ou depoimento, a base "contrato" não permite publicar: esses entram como rascunho com pedido de autorização.
    const live = canPublish(row, null).ok;
    if (!live) { row.basis = "consent"; row.status = "draft"; }
    try {
      const [r] = await db().insert(showcases).values({ ...row, contentHash: contentHash(row), publishedAt: live ? now : null }).onConflictDoNothing().returning();
      if (r) imported.push(p.slug);
    } catch (e) { if (!dupe(e)) throw e; }
  }
  return { imported };
}

export type CaseInput = Partial<Omit<CaseRow, "status" | "slug">> & { slug?: string; projectId?: string | null; contactId?: string | null };

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function values(input: CaseInput) {
  const v: Partial<typeof showcases.$inferInsert> = {};
  if (input.title !== undefined) v.title = input.title.trim();
  if (input.basis !== undefined) v.basis = input.basis;
  if (input.service !== undefined) v.service = input.service;
  if (input.category !== undefined) v.category = clean(input.category);
  if (input.clientName !== undefined) v.clientName = clean(input.clientName);
  if (input.clientLogo !== undefined) v.clientLogo = clean(input.clientLogo);
  if (input.year !== undefined) v.year = clean(input.year);
  if (input.description !== undefined) v.description = clean(input.description);
  if (input.longDescription !== undefined) v.longDescription = clean(input.longDescription);
  if (input.about !== undefined) v.about = (input.about ?? []).map((s) => s.trim()).filter(Boolean);
  if (input.img !== undefined) v.img = clean(input.img);
  if (input.gallery !== undefined) v.gallery = (input.gallery ?? []).map((s) => s.trim()).filter(Boolean);
  if (input.videoLabel !== undefined) v.videoLabel = clean(input.videoLabel);
  if (input.videoId !== undefined) v.videoId = clean(input.videoId);
  if (input.siteUrl !== undefined) v.siteUrl = clean(input.siteUrl);
  if (input.metrics !== undefined) v.metrics = clean(input.metrics);
  if (input.testimonial !== undefined) v.testimonial = clean(input.testimonial);
  if (input.testimonialAuthor !== undefined) v.testimonialAuthor = clean(input.testimonialAuthor);
  if (input.projectId !== undefined) v.projectId = input.projectId;
  if (input.contactId !== undefined) v.contactId = input.contactId;
  return v;
}


export async function createCase(input: CaseInput & { title: string }): Promise<string> {
  const slug = slugify(input.slug || input.title);
  if (!slug) throw new PublicError("Dê um título ao case.");
  try {
    const [row] = await db()
      .insert(showcases)
      .values({ ...values(input), slug, title: input.title.trim() })
      .returning();
    await db().update(showcases).set({ contentHash: contentHash(toCase(row)) }).where(eq(showcases.id, row.id));
    return row.id;
  } catch (e) {
    if (dupe(e)) throw new PublicError("Já existe um case com esse endereço (slug).", 409);
    throw e;
  }
}

/** Salva. Se o case já estava autorizado/no ar e o conteúdo visível mudou, ele volta para rascunho: o cliente precisa autorizar de novo. */
export async function updateCase(id: string, input: CaseInput): Promise<{ resetToDraft: boolean }> {
  const [before] = await db().select().from(showcases).where(eq(showcases.id, id)).limit(1);
  if (!before) throw new PublicError("Case não encontrado.", 404);
  const patch: Partial<typeof showcases.$inferInsert> = { ...values(input), updatedAt: new Date() };
  if (input.slug !== undefined && input.slug.trim() && before.status !== "published") patch.slug = slugify(input.slug);
  const merged = { ...before, ...patch } as DbShowcase;
  const newHash = contentHash(toCase(merged));
  let resetToDraft = false;
  if (before.basis === "consent" && merged.basis === "consent" && newHash !== (before.contentHash ?? newHash) && ["authorized", "published"].includes(before.status)) {
    patch.status = "draft";
    patch.publishedAt = null;
    resetToDraft = true;
  }
  patch.contentHash = newHash;
  try {
    await db().update(showcases).set(patch).where(eq(showcases.id, id));
  } catch (e) {
    if (dupe(e)) throw new PublicError("Já existe um case com esse endereço (slug).", 409);
    throw e;
  }
  return { resetToDraft };
}

export async function deleteCase(id: string) {
  await db().delete(showcases).where(eq(showcases.id, id));
}

export async function publishCase(id: string) {
  const [r] = await db().select().from(showcases).where(eq(showcases.id, id)).limit(1);
  if (!r) throw new PublicError("Case não encontrado.", 404);
  const c = (await effectiveConsents([id])).get(id);
  const verdict = canPublish(toCase(r), asState(c));
  if (!verdict.ok) throw new PublicError(verdict.reason, 422);
  await db().update(showcases).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(showcases.id, id));
  return { slug: r.slug };
}

export async function unpublishCase(id: string) {
  await db().update(showcases).set({ status: "draft", publishedAt: null, updatedAt: new Date() }).where(eq(showcases.id, id));
}

/* ---------------- pedido de autorização ---------------- */

export async function issueConsent(id: string) {
  const [r] = await db().select().from(showcases).where(eq(showcases.id, id)).limit(1);
  if (!r) throw new PublicError("Case não encontrado.", 404);
  if (r.basis !== "consent") throw new PublicError("Este case não usa pedido de autorização (base: contrato ou anônimo).", 422);
  const c = toCase(r);
  if (!c.title || !c.img || !c.description) throw new PublicError("Preencha título, descrição e capa antes de pedir autorização.", 422);
  const scopes = neededScopes(c);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CONSENT_DAYS * 86_400_000);
  // Pedidos antigos ainda pendentes deixam de valer: só o link mais novo funciona.
  await db().update(showcaseConsents).set({ status: "superseded", decidedAt: null, expiresAt: new Date() }).where(and(eq(showcaseConsents.showcaseId, id), eq(showcaseConsents.status, "pending")));
  await db().insert(showcaseConsents).values({
    showcaseId: id,
    tokenHash: tokenHash(token),
    requestedScopes: scopes,
    snapshot: toPublicProject({ ...c, basis: "consent" }) as unknown as Record<string, unknown>,
    contentHash: contentHash(c),
    expiresAt,
  });
  if (r.status !== "published") await db().update(showcases).set({ status: "awaiting", updatedAt: new Date() }).where(eq(showcases.id, id));
  return { token, expiresAt, contactId: r.contactId, title: r.title };
}

export type ConsentView = {
  status: string;
  expired: boolean;
  scopes: { id: Scope; label: string }[];
  granted: Scope[];
  preview: Project;
  signerName: string | null;
  decidedAt: string | null;
  expiresAt: string;
};

async function readConsent(token: string) {
  const [row] = await db().select().from(showcaseConsents).where(eq(showcaseConsents.tokenHash, tokenHash(token))).limit(1);
  if (!row) throw new PublicError("Link não encontrado.", 404);
  const [sc] = await db().select().from(showcases).where(eq(showcases.id, row.showcaseId)).limit(1);
  if (!sc) throw new PublicError("Link não encontrado.", 404);
  return { row, sc };
}

export async function viewConsent(token: string): Promise<ConsentView> {
  const { row, sc } = await readConsent(token);
  const expired = row.status === "pending" && row.expiresAt.getTime() < Date.now();
  const isScope = (s: string): s is Scope => (SCOPES as readonly string[]).includes(s);
  return {
    status: row.status,
    expired,
    scopes: row.requestedScopes.filter(isScope).map((id) => ({ id, label: SCOPE_LABELS[id] })),
    granted: (row.grantedScopes ?? []).filter(isScope),
    // O cliente vê exatamente o que foi pedido, não o que foi editado depois.
    preview: (row.snapshot as unknown as Project) ?? toPublicProject(toCase(sc)),
    signerName: row.signerName,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function decideConsent(token: string, action: "grant" | "decline" | "revoke", opts: { scopes?: string[]; signerName?: string } = {}) {
  const { row, sc } = await readConsent(token);
  const now = new Date();
  if (action === "revoke") {
    if (row.status !== "granted") throw new PublicError("Não há autorização ativa para revogar.", 409);
    await db().update(showcaseConsents).set({ status: "revoked", decidedAt: now }).where(eq(showcaseConsents.id, row.id));
    await db().update(showcases).set({ status: "revoked", publishedAt: null, updatedAt: now }).where(eq(showcases.id, sc.id));
    return { status: "revoked" as const };
  }
  if (row.status !== "pending") throw new PublicError("Este pedido já foi respondido.", 409);
  if (row.expiresAt.getTime() < now.getTime()) throw new PublicError("Este link expirou. Peça um novo ao Kayque.", 410);
  if (action === "decline") {
    await db().update(showcaseConsents).set({ status: "declined", decidedAt: now }).where(eq(showcaseConsents.id, row.id));
    return { status: "declined" as const };
  }
  const name = (opts.signerName ?? "").trim();
  if (name.length < 2) throw new PublicError("Informe seu nome para registrar a autorização.");
  const requested = new Set(row.requestedScopes);
  const granted = (opts.scopes ?? []).filter((s): s is Scope => requested.has(s) && (SCOPES as readonly string[]).includes(s));
  if (!granted.length) throw new PublicError("Marque ao menos um item para autorizar, ou escolha \"Prefiro não\".");
  await db().update(showcaseConsents).set({ status: "granted", grantedScopes: granted, signerName: name, decidedAt: now }).where(eq(showcaseConsents.id, row.id));
  // Só avança o case se o conteúdo ainda for o que o cliente viu.
  if (contentHash(toCase(sc)) === row.contentHash && sc.status !== "published") {
    await db().update(showcases).set({ status: "authorized", updatedAt: now }).where(eq(showcases.id, sc.id));
  }
  return { status: "granted" as const };
}
