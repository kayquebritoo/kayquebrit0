// Validação do que o navegador manda nas rotas de importação (limites generosos, mas finitos).
import { z } from "zod";

export const recordSchema = z.object({
  name: z.string().max(200),
  phones: z.array(z.object({ number: z.string().max(20), source: z.enum(["google", "whatsapp", "arquivo"]), onWhatsapp: z.boolean().nullable().optional() })).max(10),
  emails: z.array(z.string().max(160)).max(10),
  photoUrl: z.string().max(1000).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  role: z.string().max(200).nullable().optional(),
  instagram: z.string().max(60).nullable().optional(),
  facebook: z.string().max(120).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  source: z.enum(["google", "whatsapp", "arquivo"]),
  externalId: z.string().max(200).nullable().optional(),
});
export const MAX_RECORDS = 5000;

export const previewBody = z.object({
  source: z.enum(["arquivo", "whatsapp", "google"]),
  text: z.string().max(8_000_000).optional(), // conteúdo do .vcf/.csv
  sessionId: z.string().uuid().optional(), // contatos do Google já buscados no callback
});
export const commitBody = z.object({
  records: z.array(recordSchema).max(MAX_RECORDS),
  decisions: z.record(z.string().max(12), z.object({ skip: z.boolean().optional(), primaryPhone: z.string().max(20).nullable().optional() })).default({}),
});
