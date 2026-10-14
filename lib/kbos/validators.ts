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
  // Fallback do admin (produção): segredo `KBOS_ADMIN_BYPASS_TOKEN`.
  // Quando confere + e-mail é o do admin, a rota cria sessão imediata sem
  // depender do provedor de e-mail. O campo é ignorado para outros e-mails.
  adminBypass: z.string().trim().max(256).optional(),
});

/* ---------- auth e-mail + senha (fluxo principal do /entrar) ---------- */
export const authLoginSchema = z.object({
  email: emailField,
  // Aceita o bypass do admin aqui também (acesso imediato na VPS):
  // se o e-mail for o do admin e a senha conferir com
  // `KBOS_ADMIN_BYPASS_TOKEN`/`KBOS_ADMIN_PASSWORD`, a sessão é criada
  // sem exigir `password_hash` no banco.
  password: z.string().min(1, { error: "Informe a senha." }).max(256),
});

export const authPasswordSchema = z.object({
  // Nova senha a definir (mínimo 8 chars).
  password: z.string().min(8, { error: "Mínimo 8 caracteres." }).max(256),
  // Bootstrap sem sessão: token bruto do Magic Link (hex) OU segredo admin.
  // Um dos dois é exigido quando não há sessão válida (ver rota).
  token: z.string().trim().max(256).optional(),
  adminBypass: z.string().trim().max(256).optional(),
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
  // Fase 1 — vitrine (opcionais; slug validado como slug URL).
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Slug inválido." })
    .max(100)
    .optional(),
  description: z.string().trim().max(5000).optional(),
  coverUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
  thumbUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
  videoUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
  courseId: uuidField.optional(),
});
export const projectPatchSchema = nonEmpty(
  z.object({
    status: z.enum(PROJECT_STATUS).optional(),
    titulo: shortText(160).optional(),
    valor: moneyField.nullable().optional(),
    prazo: dateField.nullable().optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Slug inválido." })
      .max(100)
      .nullable()
      .optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    coverUrl: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
    thumbUrl: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
    videoUrl: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
    courseId: uuidField.nullable().optional(),
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
  thumbnailUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
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
    thumbnailUrl: z.url({ error: "URL inválida." }).max(2000).nullable().optional(),
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
export const checkoutSchema = z.object({
  courseId: uuidField,
});
export const waAdminActionSchema = z.object({
  action: z.enum(["restart", "logout"]),
});

/* ---------- Fase 1: CRM + Kanban de vendas ---------- */
const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .optional()
  .refine((s) => !s || /.+@.+\..+/.test(s), { error: "E-mail inválido." });
const optionalUrl = z.url({ error: "URL inválida." }).max(2000);

export const contactCreateSchema = z.object({
  name: shortText(120),
  email: optionalEmail,
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  status: z.enum(["lead", "client", "partner", "archived"]).optional(),
  notes: z.string().trim().max(5000).optional(),
});
export const contactPatchSchema = nonEmpty(
  z.object({
    name: shortText(120).optional(),
    email: z.string().trim().max(160).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    company: z.string().trim().max(160).nullable().optional(),
    status: z.enum(["lead", "client", "partner", "archived"]).optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
);

export const dealCreateSchema = z.object({
  title: shortText(160),
  contactId: uuidField.optional(),
  stage: z.enum(["prospecting", "proposal", "negotiation", "won", "lost"]).optional(),
  value: moneyField.optional(),
  position: z.coerce.number().int().min(0).max(100000).optional(),
});
export const dealPatchSchema = nonEmpty(
  z.object({
    title: shortText(160).optional(),
    contactId: uuidField.nullable().optional(),
    stage: z.enum(["prospecting", "proposal", "negotiation", "won", "lost"]).optional(),
    value: moneyField.nullable().optional(),
    position: z.coerce.number().int().min(0).max(100000).optional(),
  })
);

// Re-export p/ compat: rotas de vitrine usam `optionalUrl` no client.
export { optionalUrl };

/* ---------- Fase 2: Inbox omnichannel ---------- */
export const conversationCreateSchema = z.object({
  contactId: uuidField.optional(),
  channel: z.enum(["whatsapp", "instagram", "telegram", "messenger", "webchat"]).optional(),
  // Telefone ou identificador externo (ex. remoteJid). Vira `channel_chat_id`.
  channelChatId: z.string().trim().min(3).max(160),
  status: z.enum(["open", "pending", "closed"]).optional(),
});
export const conversationPatchSchema = nonEmpty(
  z.object({
    contactId: uuidField.nullable().optional(),
    status: z.enum(["open", "pending", "closed"]).optional(),
    // Agente abriu o chat: zera o contador sem mudar o status.
    markRead: z.boolean().optional(),
  })
);

export const inboxSendSchema = z
  .object({
    content: z.string().trim().max(4000).optional(),
    mediaUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
    messageType: z.enum(["text", "image", "audio", "document"]).optional(),
  })
  .refine((b) => (b.content?.trim() ? true : !!b.mediaUrl), {
    error: "Informe texto ou anexo.",
  });

/* ---------- Fase 3: campanhas + assistente de IA ---------- */
export const campaignCreateSchema = z.object({
  title: shortText(120),
  messageTemplate: z.string().trim().min(1, { error: "Template obrigatório." }).max(4000),
  targetStatus: z.enum(["all", "lead", "client", "partner", "archived"]).optional(),
  scheduledAt: dateField.optional(),
});
export const campaignPatchSchema = nonEmpty(
  z.object({
    title: shortText(120).optional(),
    messageTemplate: z.string().trim().min(1).max(4000).optional(),
    targetStatus: z.enum(["all", "lead", "client", "partner", "archived"]).optional(),
    scheduledAt: dateField.nullable().optional(),
  })
);
export const campaignDispatchSchema = z.object({
  // Reagenda na hora do disparo (opcional); sem ele, vale `scheduled_at` ou imediato.
  scheduledAt: dateField.optional(),
});

export const assistantTurnSchema = z
  .object({
    conversationId: uuidField.optional(),
    channel: z.enum(["whatsapp", "instagram", "telegram", "messenger", "webchat"]).optional(),
    channelChatId: z.string().trim().min(3).max(160).optional(),
    text: z.string().trim().max(4000).optional(),
    audioUrl: z.url({ error: "URL inválida." }).max(2000).optional(),
    audioBase64: z.string().max(15_000_000).optional(),
    audioMime: z.string().trim().max(80).optional(),
    voicePrompt: z.string().trim().max(4000).optional(),
    send: z.boolean().optional(),
    tts: z.boolean().optional(),
    voice: z.string().trim().max(40).optional(),
  })
  .refine((b) => b.text?.trim() || b.audioUrl || b.audioBase64, {
    error: "Informe `text` ou áudio (`audioUrl`/`audioBase64`).",
  });

/* ---------- Fase 4: financeiro + agenda ---------- */
export const financeCreateSchema = z.object({
  type: z.enum(["income", "expense"]),
  description: shortText(200),
  amount: moneyField,
  category: z.string().trim().max(80).optional(),
  dueDate: dateField.optional(),
  status: z.enum(["pending", "paid"]).optional(),
});
export const financePatchSchema = nonEmpty(
  z.object({
    type: z.enum(["income", "expense"]).optional(),
    description: shortText(200).optional(),
    amount: moneyField.nullable().optional(),
    category: z.string().trim().max(80).nullable().optional(),
    dueDate: dateField.nullable().optional(),
    status: z.enum(["pending", "paid"]).optional(),
  })
);

export const eventCreateSchema = z
  .object({
    title: shortText(160),
    description: z.string().trim().max(2000).optional(),
    startTime: dateField,
    endTime: dateField.optional(),
    location: z.string().trim().max(200).optional(),
    reminderMinutesBefore: z.coerce.number().int().min(0).max(10080).optional(),
  })
  .refine(
    (b) => !b.endTime || new Date(b.endTime).getTime() >= new Date(b.startTime).getTime(),
    { error: "Término anterior ao início." }
  );
export const eventPatchSchema = nonEmpty(
  z.object({
    title: shortText(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startTime: dateField.optional(),
    endTime: dateField.nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    reminderMinutesBefore: z.coerce.number().int().min(0).max(10080).optional(),
    // Reavisar: zera o flag p/ o worker disparar de novo.
    markUnsent: z.boolean().optional(),
  })
);

/* ---------- orçamentos ---------- */
const budgetStatusEnum = z.enum(["draft", "sent", "approved", "completed", "cancelled", "rejected"]);
const discountTypeEnum = z.enum(["fixed", "percent"]);
const paymentConditionEnum = z.enum(["cash", "installments", "card"]);
const discountValueField = z.coerce.number().min(0).max(1e12);
const eventDatesField = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida." }))
  .max(60);
export const budgetItemSchema = z.object({
  service: shortText(120),
  description: z.string().trim().max(500).nullable().optional(),
  quantity: z.coerce.number().positive().max(100000),
  unitPrice: z.coerce.number().min(0).max(1e12),
});
export const budgetCreateSchema = z.object({
  title: shortText(160),
  contactId: uuidField.nullable().optional(),
  items: z.array(budgetItemSchema).min(1).max(100),
  status: budgetStatusEnum.optional(),
  validUntil: dateField.nullable().optional(),
  terms: z.string().trim().max(5000).nullable().optional(),
  bankInfo: z.string().trim().max(2000).nullable().optional(),
  clientName: z.string().trim().max(160).nullable().optional(),
  clientCompany: z.string().trim().max(160).nullable().optional(),
  eventDates: eventDatesField.nullable().optional(),
  discountType: discountTypeEnum.nullable().optional(),
  discountValue: discountValueField.nullable().optional(),
  paymentCondition: paymentConditionEnum.nullable().optional(),
  deliveryDeadline: z.string().trim().max(120).nullable().optional(),
  revisionsCount: z.coerce.number().int().min(0).max(100).nullable().optional(),
});
export const budgetPatchSchema = nonEmpty(
  z.object({
    title: shortText(160).optional(),
    contactId: uuidField.nullable().optional(),
    items: z.array(budgetItemSchema).min(1).max(100).optional(),
    status: budgetStatusEnum.optional(),
    validUntil: dateField.nullable().optional(),
    terms: z.string().trim().max(5000).nullable().optional(),
    bankInfo: z.string().trim().max(2000).nullable().optional(),
    clientName: z.string().trim().max(160).nullable().optional(),
    clientCompany: z.string().trim().max(160).nullable().optional(),
    eventDates: eventDatesField.nullable().optional(),
    discountType: discountTypeEnum.nullable().optional(),
    discountValue: discountValueField.nullable().optional(),
    paymentCondition: paymentConditionEnum.nullable().optional(),
    deliveryDeadline: z.string().trim().max(120).nullable().optional(),
    revisionsCount: z.coerce.number().int().min(0).max(100).nullable().optional(),
  })
);

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
