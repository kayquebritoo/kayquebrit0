// Schemas Zod de todos os payloads da API KBOS.
// Regra: nenhuma rota POST/PATCH confia no corpo — tudo passa por `readBody`.
import { z } from "zod";
import { NextResponse } from "next/server";
import { PIPELINE, ROLE_LABELS } from "./constants";

const ROLES = Object.keys(ROLE_LABELS) as [string, ...string[]];
const PROJECT_STATUS = PIPELINE.map((p) => p.id) as [string, ...string[]];

export const uuidField = z.uuid({ error: "ID inválido." });
export const emailField = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.email({ error: "E-mail inválido." }).max(160));
export const moneyField = z
  .union([z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, { error: "Valor inválido." }), z.number().positive().max(1e12)])
  .transform((v) => String(v));
export const dateField = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { error: "Data inválida." });
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** PATCH vazio não atualiza nada — rejeita antes do banco. */
function nonEmpty<T extends z.ZodRawShape>(s: z.ZodObject<T>) {
  return s.refine((o) => Object.keys(o).length > 0, { error: "Nada para atualizar." });
}

/* ---------- auth ---------- */
export const authRequestSchema = z.object({
  email: emailField,
  name: z.string().trim().max(120).optional(),
});

/* ---------- briefings ---------- */
export const briefingCreateSchema = z.object({
  categoria: shortText(60),
  respostas: z
    .record(z.string(), z.string())
    .refine((r) => Object.keys(r).length <= 120, { error: "Respostas demais." }),
});
export const briefingStatusSchema = z.object({
  status: z.enum(["novo", "em_analise", "aprovado", "contrato_gerado", "arquivado"]),
});

/* ---------- projects ---------- */
export const projectCreateSchema = z.object({
  titulo: shortText(160),
  categoria: shortText(80),
  clienteId: uuidField.optional(),
  clienteEmail: z.email().max(160).optional(),
  briefingId: uuidField.optional(),
  valor: moneyField.optional(),
  prazo: dateField.optional(),
});
export const projectPatchSchema = nonEmpty(
  z.object({
    status: z.enum(PROJECT_STATUS).optional(),
    titulo: shortText(160).optional(),
    valor: moneyField.nullable().optional(),
    prazo: dateField.nullable().optional(),
  })
);

/* ---------- files ---------- */
export const fileCreateSchema = z.object({
  nome: shortText(200),
  url: z.url({ error: "URL inválida." }).max(2000),
  kind: z.enum(["entrega", "aprovacao"]).optional(),
});
export const fileReviewSchema = z.object({
  status: z.enum(["aprovado", "reprovado"]),
  feedback: z.string().trim().max(2000).optional(),
});

/* ---------- tasks ---------- */
export const taskCreateSchema = z.object({
  projectId: uuidField,
  titulo: shortText(160),
  responsavelRole: z.enum(ROLES).optional(),
  estimativaMin: z.coerce.number().int().positive().max(1_000_000).optional(),
});
export const taskPatchSchema = nonEmpty(
  z.object({
    status: z.enum(["todo", "doing", "done"]).optional(),
    titulo: shortText(160).optional(),
  })
);

/* ---------- time ---------- */
export const timeSchema = z.object({
  action: z.enum(["start", "stop"]),
  projectId: uuidField,
  taskId: uuidField.optional(),
});

/* ---------- transactions ---------- */
export const transactionCreateSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  descricao: shortText(200),
  categoria: shortText(80).optional(),
  valor: moneyField,
  vencimento: dateField.optional(),
  status: z.enum(["pendente", "pago", "vencido"]).optional(),
  projectId: uuidField.optional(),
});
export const transactionPatchSchema = nonEmpty(
  z.object({
    status: z.enum(["pendente", "pago", "vencido"]).optional(),
    gatewayRef: shortText(120).optional(),
  })
);

/* ---------- webhooks ---------- */
export const whatsappStatusSchema = z.object({
  notificationId: uuidField,
  status: z.enum(["enviado", "falha"]),
  erro: z.string().max(2000).nullable().optional(),
});
// Notificação real do Mercado Pago (IPN): type=payment, data.id = id do pagamento.
export const mpNotificationSchema = z.object({
  type: z.string().optional(),
  action: z.string().optional(),
  data: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
}).passthrough();

/* ---------- LMS ---------- */
export const courseCreateSchema = z.object({
  titulo: shortText(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Slug inválido." })
    .max(100)
    .optional(),
  descricao: z.string().trim().max(5000).optional(),
  preco: moneyField.optional(),
  capa: z.url({ error: "URL inválida." }).max(2000).optional(),
  status: z.enum(["rascunho", "publicado", "arquivado"]).optional(),
});
export const coursePatchSchema = nonEmpty(
  z.object({
    titulo: shortText(160).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Slug inválido." })
      .max(100)
      .optional(),
    descricao: z.string().trim().max(5000).nullable().optional(),
    preco: moneyField.nullable().optional(),
    capa: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
    status: z.enum(["rascunho", "publicado", "arquivado"]).optional(),
  })
);
export const moduleCreateSchema = z.object({
  courseId: uuidField,
  titulo: shortText(160),
  ordem: z.coerce.number().int().min(0).max(10000).optional(),
});
export const modulePatchSchema = nonEmpty(
  z.object({
    titulo: shortText(160).optional(),
    ordem: z.coerce.number().int().min(0).max(10000).optional(),
  })
);
export const lessonCreateSchema = z.object({
  moduleId: uuidField,
  titulo: shortText(160),
  descricao: z.string().trim().max(5000).optional(),
  tipo: z.enum(["video", "texto", "quiz", "arquivo"]).optional(),
  videoUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
  conteudo: z.string().max(100000).optional(),
  duracaoMin: z.coerce.number().int().positive().max(100000).optional(),
  ordem: z.coerce.number().int().min(0).max(10000).optional(),
  dripDays: z.coerce.number().int().min(0).max(3650).optional(),
});
export const lessonPatchSchema = nonEmpty(
  z.object({
    titulo: shortText(160).optional(),
    descricao: z.string().trim().max(5000).nullable().optional(),
    tipo: z.enum(["video", "texto", "quiz", "arquivo"]).optional(),
    videoUrl: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
    conteudo: z.string().max(100000).nullable().optional(),
    duracaoMin: z.coerce.number().int().positive().max(100000).nullable().optional(),
    ordem: z.coerce.number().int().min(0).max(10000).optional(),
    dripDays: z.coerce.number().int().min(0).max(3650).optional(),
  })
);
export const enrollmentCreateSchema = z.object({
  courseId: uuidField,
  userId: uuidField.optional(),
  transactionId: uuidField.optional(),
  status: z.enum(["pendente", "ativa"]).optional(),
});
export const progressCompleteSchema = z.object({
  enrollmentId: uuidField,
  lessonId: uuidField,
});

/* ---------- leitura validada ---------- */

export type Issue = { campo: string; mensagem: string };

function toIssues(err: z.ZodError): Issue[] {
  return err.issues.map((i) => ({
    campo: i.path.length ? String(i.path.map(String).join(".")) : "(corpo)",
    mensagem: i.message,
  }));
}

export function badRequest(message: string, details?: Issue[]) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });
}

export function invalidId() {
  return badRequest("ID inválido.");
}

/** Lê JSON + valida. Retorna `{ data }` ou `{ error: Response 400 }`. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: badRequest("Corpo JSON inválido.") } as const;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: badRequest("Payload inválido.", toIssues(parsed.error)) } as const;
  }
  return { data: parsed.data } as const;
}

/** Valida parâmetro de rota `:id` como uuid (evita 500 no Drizzle). */
export function checkId(id: string) {
  return uuidField.safeParse(id).success ? null : invalidId();
}
