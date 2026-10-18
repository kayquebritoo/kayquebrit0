import { z } from "zod";
import { BASES, SERVICES } from "./showcase-model";

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const url = z.string().trim().max(2000).refine((v) => !v || v.startsWith("/") || /^https:\/\//.test(v), { error: "Use um link https:// ou um caminho do site (/assets/...)." });

export const caseSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().max(80).optional(),
  basis: z.enum(BASES).optional(),
  service: z.enum(SERVICES).optional(),
  category: opt(60),
  clientName: opt(120),
  clientLogo: url.nullable().optional(),
  year: opt(10),
  description: opt(300),
  longDescription: opt(1200),
  about: z.array(z.string().trim().min(1).max(900)).max(4).nullable().optional(),
  img: url.nullable().optional(),
  gallery: z.array(url).max(12).nullable().optional(),
  videoLabel: opt(60),
  videoId: z.string().trim().max(20).regex(/^[A-Za-z0-9_-]*$/, { error: "ID do YouTube inválido." }).nullable().optional(),
  siteUrl: url.nullable().optional(),
  metrics: opt(300),
  testimonial: opt(600),
  testimonialAuthor: opt(120),
  projectId: z.uuid().nullable().optional(),
  contactId: z.uuid().nullable().optional(),
});
