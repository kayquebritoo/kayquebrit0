// Regras dos cases do portfólio com autorização do cliente (puro, testável).
// A trava de publicação vive aqui e é chamada no servidor: sem autorização
// válida, o case não vai ao ar, mesmo que a tela permita o clique.
import { createHash } from "node:crypto";
import type { Project } from "../data";

export const SCOPES = ["name", "logo", "images", "numbers", "testimonial"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  name: "Nome da empresa",
  logo: "Logo",
  images: "Imagens e vídeos do projeto",
  numbers: "Números e resultados",
  testimonial: "Depoimento",
};

export const SERVICES = ["audiovisual", "dev", "branding"] as const;
export type CaseService = (typeof SERVICES)[number];
export const CASE_STATUS = ["draft", "awaiting", "authorized", "published", "revoked"] as const;
export type CaseStatus = (typeof CASE_STATUS)[number];
/** consent = precisa de autorização; contract = coberto pela cláusula do contrato (sem números/depoimento); anonymous = sem nome. */
export const BASES = ["consent", "contract", "anonymous"] as const;
export type CaseBasis = (typeof BASES)[number];

export type CaseRow = {
  slug: string;
  title: string;
  status: string;
  basis: string;
  service: string;
  category: string | null;
  clientName: string | null;
  clientLogo: string | null;
  year: string | null;
  description: string | null;
  longDescription: string | null;
  about: string[] | null;
  img: string | null;
  gallery: string[] | null;
  videoLabel: string | null;
  videoId: string | null;
  siteUrl: string | null;
  metrics: string | null;
  testimonial: string | null;
  testimonialAuthor: string | null;
};

export type ConsentState = {
  status: string;
  grantedScopes: string[] | null;
  contentHash: string;
  expiresAt?: Date | string | null;
} | null;

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** Tudo que o visitante pode ver. Mudou algo aqui depois da autorização → precisa pedir de novo. */
export function contentHash(c: CaseRow): string {
  const payload = JSON.stringify([
    c.title, c.category, c.clientName, c.clientLogo, c.year, c.description, c.longDescription,
    c.about ?? [], c.img, c.gallery ?? [], c.videoId, c.siteUrl, c.metrics, c.testimonial, c.testimonialAuthor,
  ]);
  return createHash("sha256").update(payload).digest("hex");
}

/** O que o case mostra e, portanto, o que o cliente precisa liberar. */
export function neededScopes(c: CaseRow): Scope[] {
  const out: Scope[] = [];
  if (c.basis !== "anonymous" && has(c.clientName)) out.push("name");
  if (c.basis !== "anonymous" && has(c.clientLogo)) out.push("logo");
  if (has(c.img) || (c.gallery?.length ?? 0) > 0 || has(c.videoId)) out.push("images");
  if (c.basis !== "anonymous" && has(c.metrics)) out.push("numbers");
  if (c.basis !== "anonymous" && has(c.testimonial)) out.push("testimonial");
  return out;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

export function canPublish(c: CaseRow, consent: ConsentState, now = new Date()): Verdict {
  if (!has(c.title) || !has(c.img) || !has(c.description)) {
    return { ok: false, reason: "Faltam título, descrição ou imagem de capa." };
  }
  if (c.basis === "anonymous") return { ok: true };
  if (c.basis === "contract") {
    if (has(c.metrics) || has(c.testimonial)) {
      return { ok: false, reason: "Números e depoimento exigem autorização explícita do cliente." };
    }
    return { ok: true };
  }
  if (!consent || consent.status !== "granted") return { ok: false, reason: "Falta a autorização do cliente." };
  if (consent.contentHash !== contentHash(c)) {
    return { ok: false, reason: "O case mudou depois da autorização. Peça de novo ao cliente." };
  }
  const granted = new Set(consent.grantedScopes ?? []);
  const missing = neededScopes(c).filter((s) => !granted.has(s));
  if (missing.length) {
    return { ok: false, reason: `O cliente não liberou: ${missing.map((s) => SCOPE_LABELS[s].toLowerCase()).join(", ")}.` };
  }
  return { ok: true };
}

/** Versão pública do case: nada além da lista fixa de campos. */
export function toPublicProject(c: CaseRow): Project {
  const anon = c.basis === "anonymous";
  const consent = c.basis === "consent";
  const service = (SERVICES as readonly string[]).includes(c.service) ? (c.service as CaseService) : "audiovisual";
  const fallbackCategory = service === "audiovisual" ? "Produção Audiovisual" : service === "dev" ? "Desenvolvimento" : "Branding";
  const gallery = (c.gallery ?? []).filter(Boolean);
  const p: Project = {
    slug: c.slug,
    title: c.title,
    category: c.category || fallbackCategory,
    service,
    description: c.description ?? "",
    longDescription: c.longDescription || c.description || "",
    about: (c.about ?? []).filter(Boolean),
    img: c.img ?? "",
    gallery: gallery.length ? gallery : c.img ? [c.img] : [],
    videoLabel: c.videoLabel || "Play",
    client: anon || !has(c.clientName) ? "Cliente confidencial" : (c.clientName as string),
    year: c.year ?? "",
  };
  if (has(c.videoId)) p.videoId = c.videoId as string;
  if (has(c.siteUrl)) p.siteUrl = c.siteUrl as string;
  if (consent && has(c.metrics)) p.metrics = c.metrics as string;
  if (consent && has(c.testimonial)) p.testimonial = { text: c.testimonial as string, author: c.testimonialAuthor ?? "" };
  return p;
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
