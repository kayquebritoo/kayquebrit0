// Schema KBOS — todas as tabelas do ecossistema.
// Convenção: ids uuid, timestamps com timezone, valores em `numeric`.
//
// CONTRATO COM O BANCO (produção/VPS): os campos camelCase do Drizzle mapeiam
// para colunas snake_case existentes (`createdAt` -> `created_at`,
// `userId` -> `user_id`, `tokenHash` -> `token_hash`, ...). Este arquivo é a
// fonte de verdade e confere 1:1 com `drizzle/*.sql` (aplicado via
// `npx drizzle-kit push`):
//   - `users`      <-> kbos_users(id, email, name, role, phone, password_hash, created_at)
//   - `sessions`   <-> kbos_sessions(id uuid, user_id, expires_at, created_at)
//   - `loginTokens`<-> kbos_login_tokens(id, email, token_hash, expires_at,
//                     consumed, created_at)
// Regras de segurança do mapeamento:
//   1. Nunca renomear coluna aqui sem migration (quebra as rotas de auth).
//   2. `sessions.id` é uuid: o bypass do admin (`KBOS_ADMIN_BYPASS_TOKEN`)
//      NUNCA chega ao Postgres — é comparado em memória em `admin-access.ts`
//      antes de qualquer query (evita `invalid input syntax for type uuid`).
//   3. Queries de sessão validam o formato uuid antes (`isUuidLike`) e
//      retornam 401 em vez de 500 para valores inesperados.
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) =>
  timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("kbos_role", [
  "admin",
  "designer",
  "editor",
  "fotografo",
  "programador",
  "cliente",
]);

export const users = pgTable("kbos_users", {
  username: text("username"),
  googleSubject: text("google_subject").unique(),
  authCodeRequestedAt: timestamp("auth_code_requested_at", {withTimezone:true}),
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("cliente"),
  phone: text("phone"),
  // Login e-mail + senha (scrypt, ver `password.ts`). Nullable p/ legado
  // Magic Link: contas antigas definem a senha via `/api/auth/password`
  // com o token do link mágico; admin usa o bypass como senha imediata.
  passwordHash: text("password_hash"),
  createdAt: ts("created_at"),
}, (table) => [uniqueIndex("kbos_users_username_unique").on(sql`lower(${table.username})`)]);

export const sessions = pgTable("kbos_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: ts("created_at"),
});

export const loginTokens = pgTable("kbos_login_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumed: boolean("consumed").notNull().default(false),
  createdAt: ts("created_at"),
});

export const briefingStatus = pgEnum("kbos_briefing_status", [
  "novo",
  "em_analise",
  "aprovado",
  "contrato_gerado",
  "arquivado",
]);

export const briefings = pgTable("kbos_briefings", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoria: text("categoria").notNull(),
  clienteNome: text("cliente_nome").notNull(),
  clienteEmail: text("cliente_email").notNull(),
  clienteTel: text("cliente_tel"),
  respostas: jsonb("respostas").notNull().$type<Record<string, string>>(),
  status: briefingStatus("status").notNull().default("novo"),
  valorEstimado: numeric("valor_estimado"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const projectStatus = pgEnum("kbos_project_status", [
  "novo",
  "briefing",
  "producao",
  "revisao",
  "aprovado",
  "entregue",
]);

export const projects = pgTable("kbos_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo").notNull(),
  categoria: text("categoria").notNull(),
  clienteId: uuid("cliente_id").references(() => users.id),
  briefingId: uuid("briefing_id").references(() => briefings.id),
  status: projectStatus("status").notNull().default("novo"),
  valor: numeric("valor"),
  prazo: timestamp("prazo", { withTimezone: true }),
  // Fase 1 — vitrine / associação com cursos (todos nullable p/ legado):
  slug: text("slug").unique(),
  description: text("description"),
  coverUrl: text("cover_url"),
  thumbUrl: text("thumb_url"),
  videoUrl: text("video_url"),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  // 0011: cliente no CRM e orçamento de origem.
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  budgetId: uuid("budget_id").references(() => budgets.id, { onDelete: "set null" }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const fileStatus = pgEnum("kbos_file_status", ["enviado", "aprovado", "reprovado"]);

export const projectFiles = pgTable("kbos_project_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("entrega"),
  status: fileStatus("status").notNull().default("enviado"),
  createdAt: ts("created_at"),
});

export const taskStatus = pgEnum("kbos_task_status", ["todo", "doing", "done"]);

export const tasks = pgTable("kbos_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 0011: tarefa pode ser avulsa (sem projeto).
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  responsavelRole: text("responsavel_role"),
  status: taskStatus("status").notNull().default("todo"),
  estimativaMin: integer("estimativa_min"),
  // 0011: prazo, descrição, quem faz (nome livre), prioridade, cliente.
  dueAt: timestamp("due_at", { withTimezone: true }),
  description: text("description"),
  assignee: text("assignee"),
  priority: text("priority").notNull().default("normal"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const timeEntries = pgTable("kbos_time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inicio: timestamp("inicio", { withTimezone: true }).notNull().defaultNow(),
  fim: timestamp("fim", { withTimezone: true }),
  segundos: integer("segundos"),
});

export const trxTipo = pgEnum("kbos_trx_tipo", ["entrada", "saida"]);
export const trxStatus = pgEnum("kbos_trx_status", ["pendente", "pago", "vencido"]);

export const transactions = pgTable("kbos_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: trxTipo("tipo").notNull(),
  descricao: text("descricao").notNull(),
  categoria: text("categoria"),
  valor: numeric("valor").notNull(),
  vencimento: timestamp("vencimento", { withTimezone: true }),
  status: trxStatus("status").notNull().default("pendente"),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  gatewayRef: text("gateway_ref"),
  // 0010: empresa × pessoal, cliente/fornecedor, forma de pagamento, recorrência.
  scope: text("scope").notNull().default("empresa"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  paymentMethod: text("payment_method"),
  recurrence: text("recurrence"),
  notes: text("notes"),
  createdAt: ts("created_at"),
  // Fase 4 — `updated_at` (a API `/api/finance` o expõe como `updatedAt`).
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const notifStatus = pgEnum("kbos_notif_status", ["pendente", "enviado", "falha"]);

export const notifications = pgTable("kbos_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  canal: text("canal").notNull().default("whatsapp"),
  destino: text("destino").notNull(),
  mensagem: text("mensagem").notNull(),
  evento: text("evento"),
  status: notifStatus("status").notNull().default("pendente"),
  erro: text("erro"),
  createdAt: ts("created_at"),
});

// Fila de jobs (KBOS jobs) — espelho/auditoria em Postgres da fila BullMQ/Redis.
// O request HTTP só escreve aqui (+ Redis); o worker executa e atualiza o status.
// `idempotency_key` única = enfileirar 2x o mesmo trabalho retorna o existente.
export const jobStatus = pgEnum("kbos_job_status", [
  "pendente", // só no Postgres (Redis indisponível) — sweeper reenfileira
  "ativo", // entregue ao BullMQ
  "concluido",
  "falha", // esgotou as tentativas (DLQ lógica)
  "morto", // falha irrecuperável (ex.: provider não configurado)
]);

export const jobs = pgTable("kbos_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: text("tipo").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
  status: jobStatus("status").notNull().default("pendente"),
  tentativas: integer("tentativas").notNull().default(0),
  maxTentativas: integer("max_tentativas").notNull().default(5),
  proximaTentativa: timestamp("proxima_tentativa", { withTimezone: true }),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  bullmqId: text("bullmq_id"),
  erro: text("erro"),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Role = (typeof roleEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatus.enumValues)[number];

// ---------- LMS (cursos, matrículas, progresso, certificados) ----------

export const courseStatus = pgEnum("kbos_course_status", ["rascunho", "publicado", "arquivado"]);

export const courses = pgTable("kbos_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo").notNull(),
  slug: text("slug").notNull().unique(),
  descricao: text("descricao"),
  preco: numeric("preco"),
  capa: text("capa"),
  // Fase 1 — alias explícito p/ thumbnail da plataforma (espelha `capa`).
  thumbnailUrl: text("thumbnail_url"),
  status: courseStatus("status").notNull().default("rascunho"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const modules = pgTable("kbos_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  ordem: integer("ordem").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const lessonType = pgEnum("kbos_lesson_type", ["video", "texto", "quiz", "arquivo"]);

export const lessons = pgTable("kbos_lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  tipo: lessonType("tipo").notNull().default("video"),
  videoUrl: text("video_url"),
  conteudo: text("conteudo"),
  duracaoMin: integer("duracao_min"),
  ordem: integer("ordem").notNull().default(0),
  /** drip: dias após a matrícula para liberar (0 = imediato) */
  dripDays: integer("drip_days").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const enrollmentStatus = pgEnum("kbos_enrollment_status", [
  "pendente",
  "ativa",
  "pausada",
  "concluida",
  "cancelada",
]);

export const enrollments = pgTable(
  "kbos_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: enrollmentStatus("status").notNull().default("pendente"),
    transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    progressoPct: numeric("progresso_pct").notNull().default("0"),
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    // um aluno = uma matrícula por curso (409 em duplicada)
    uniqueIndex("kbos_enrollments_user_course_unique").on(t.userId, t.courseId),
  ]
);

export const lessonProgress = pgTable(
  "kbos_lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    concluida: boolean("concluida").notNull().default(false),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (t) => [
    // uma linha por (matrícula, aula)
    uniqueIndex("kbos_lesson_progress_unique").on(t.enrollmentId, t.lessonId),
  ]
);

export const certificates = pgTable("kbos_certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id")
    .notNull()
    .references(() => enrollments.id, { onDelete: "cascade" })
    .unique(),
  codigo: text("codigo").notNull().unique(),
  emitidaEm: timestamp("emitida_em", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Fase 1: CRM, Kanban de vendas, vitrine projetos/cursos ----------
//
// `contacts` + `deals` são tabelas novas (sem legado). `projects` e `courses`
// já existiam no monólito com campos operacionais (titulo/categoria/cliente…);
// a Fase 1 ESTENDE ambas com colunas de vitrine (slug, mídias, course_id…)
// mantendo 100% de compatibilidade: tudo novo é nullable e o SQL está em
// `drizzle/0002_fase1_crm_kanban.sql` (aplicar com `npx drizzle-kit push`).

export const contactStatus = pgEnum("kbos_contact_status", [
  "lead",
  "client",
  "partner",
  "archived",
]);

export const contacts = pgTable("kbos_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  status: contactStatus("status").notNull().default("lead"),
  notes: text("notes"),
  // Cadastro completo (0010): PF/PJ, CPF/CNPJ, razão social, endereço.
  kind: text("kind").notNull().default("pf"),
  document: text("document"),
  legalName: text("legal_name"),
  stateRegistration: text("state_registration"),
  role: text("role"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  website: text("website"),
  instagram: text("instagram"),
  source: text("source"),
  // 0020: importação de contatos (Google/WhatsApp/arquivo).
  facebook: text("facebook"),
  photoUrl: text("photo_url"),
  extraEmails: jsonb("extra_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Números antigos: saem da ficha, mas ficam guardados só para reconhecer a mesma pessoa numa próxima importação. */
  formerPhones: jsonb("former_phones").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  // 0018: respondeu SAIR → não recebe campanhas (avisos de projeto/cobrança seguem).
  marketingOptOutAt: timestamp("marketing_opt_out_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const dealStage = pgEnum("kbos_deal_stage", [
  "prospecting",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export const deals = pgTable("kbos_deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  stage: dealStage("stage").notNull().default("prospecting"),
  value: numeric("value"),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// ---------- Fase 2: Motor Omnichannel & Inbox Unificado ----------
//
// `conversations` agrega um chat externo (Evolution API ou outra rede) a um
// contato do CRM. `messages` guarda o histórico em ordem de chegada.
// `channel_chat_id` é o identificador remoto (ex. `5511999998888@s.whatsapp.net`
// ou o `remoteJid`); a unicidade é composta (channel, channel_chat_id) para
// permitir o mesmo contato em várias redes.
// `external_id` (id da mensagem na rede, ex. `3EB0...`) garante idempotência
// do webhook: reentregas do mesmo evento não duplicam linhas.
// SQL em `drizzle/0003_fase2_inbox.sql` (aplicar com `npx drizzle-kit push`).

export const convChannel = pgEnum("kbos_conv_channel", [
  "whatsapp",
  "instagram",
  "telegram",
  "messenger",
  "webchat",
]);

export const convStatus = pgEnum("kbos_conv_status", ["open", "pending", "closed"]);

export const conversations = pgTable(
  "kbos_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    channel: convChannel("channel").notNull().default("whatsapp"),
    channelChatId: text("channel_chat_id").notNull(),
    status: convStatus("status").notNull().default("open"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    // Grupos (0010): nome do grupo e prévia da última mensagem.
    title: text("title"),
    isGroup: boolean("is_group").notNull().default(false),
    lastPreview: text("last_preview"),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // um chat externo = uma conversa (reentregas fazem upsert, não duplicam)
    uniqueIndex("kbos_conversations_channel_chat_unique").on(t.channel, t.channelChatId),
  ]
);

export const senderType = pgEnum("kbos_sender_type", ["customer", "agent", "ai"]);

export const messageType = pgEnum("kbos_message_type", ["text", "image", "audio", "document", "video"]);

export const messageStatus = pgEnum("kbos_message_status", ["sent", "delivered", "read"]);

export const messages = pgTable(
  "kbos_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderType: senderType("sender_type").notNull().default("customer"),
    content: text("content"),
    mediaUrl: text("media_url"),
    messageType: messageType("message_type").notNull().default("text"),
    status: messageStatus("status").notNull().default("sent"),
    externalId: text("external_id"),
    // Autor dentro de grupos (0010).
    senderName: text("sender_name"),
    senderPhone: text("sender_phone"),
    createdAt: ts("created_at"),
  },
  (t) => [
    // idempotência do webhook (Evolution pode reentregar o mesmo evento)
    uniqueIndex("kbos_messages_external_unique").on(t.externalId),
  ]
);

// ---------- Fase 3: Campanhas de disparo + Assistente de IA ----------
//
// `campaigns` guarda o template e o progresso agregado; `campaignLogs` tem
// uma linha por destinatário (idempotência do fan-out: o worker pula logs
// que já saíram de `pending`, então replays/retries nunca duplicam envios).
// `target_status` filtra o CRM (`all` = lead+client+partner, sem arquivados).
// `scheduled_at` permite agendar; null = disparo imediato ao despachar.
// SQL em `drizzle/0004_fase3_campaigns.sql` (aplicar com `npx drizzle-kit push`).

export const campaignStatus = pgEnum("kbos_campaign_status", [
  "draft",
  "scheduled",
  "running",
  "completed",
  "failed",
]);

export const campaigns = pgTable("kbos_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  messageTemplate: text("message_template").notNull(),
  status: campaignStatus("status").notNull().default("draft"),
  targetStatus: text("target_status").notNull().default("all"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const campaignLogStatus = pgEnum("kbos_campaign_log_status", ["pending", "sent", "failed"]);

export const campaignLogs = pgTable("kbos_campaign_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  status: campaignLogStatus("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

// ---------- Fase 4: Central Financeira, Agenda e Alertas ----------
//
// `transactions` (Fase 0) já cobre o contrato financeiro pedido — o mapeamento
// EN↔PT vive em `lib/kbos/finance.ts` e a API `/api/finance` o expõe como
// `{ type: income|expense, amount, dueDate, status: pending|paid|overdue }`.
// `events` (`kbos_events`) é a agenda pessoal: o worker (`agenda.reminders`)
// reivindica atomicamente os eventos devidos e avisa via WhatsApp.
// SQL em `drizzle/0005_fase4_finance_agenda.sql` (`npx drizzle-kit push`).

export const events = pgTable("kbos_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  location: text("location"),
  reminderMinutesBefore: integer("reminder_minutes_before").notNull().default(15),
  notificationSent: boolean("notification_sent").notNull().default(false),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// ---------- Orçamentos (quotes/budgets) ----------
//
// `kbos_budgets` guarda o orçamento comercial: código sequencial legível
// (`#14001`), cliente do CRM, itens (JSONB) e total espelhado em `numeric`
// para ordenação/agregação sem parse de JSON. O PDF é gerado on-demand em
// `/api/budgets/[id]/pdf` (`lib/kbos/pdf-generator.ts`).
// SQL em `drizzle/0006_budgets.sql` (+ `drizzle/0008_budgets_pro.sql`:
// status Concluído/Cancelado, retrato do cliente, datas e desconto;
// + `drizzle/0009_budgets_terms.sql`: condição de pagamento, prazo e revisões).

export const budgetStatus = pgEnum("kbos_budget_status", [
  "draft",
  "sent",
  "approved",
  "completed",
  "cancelled",
  "rejected",
]);

export type BudgetItem = {
  service: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  /** Data de execução do item (coberturas/eventos) — ISO `yyyy-mm-dd`. */
  date?: string | null;
};

export const budgets = pgTable("kbos_budgets", {
  uploadBytes: integer("upload_bytes").notNull().default(0),
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: budgetStatus("status").notNull().default("draft"),
  totalAmount: numeric("total_amount").notNull().default("0"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  terms: text("terms"),
  bankInfo: text("bank_info"),
  items: jsonb("items").notNull().$type<BudgetItem[]>().default([]),
  // Proposta comercial p/ serviços e coberturas (0008):
  // - retrato do cliente mesmo sem vínculo no CRM;
  // - datas de execução (coberturas/eventos em dias diferentes);
  // - desconto fixo (R$) ou percentual aplicado sobre o subtotal.
  clientName: text("client_name"),
  clientCompany: text("client_company"),
  clientDocument: text("client_document"),
  eventDates: jsonb("event_dates").$type<string[]>(),
  discountType: text("discount_type"),
  discountValue: numeric("discount_value"),
  // Condições comerciais (0009): forma preferida, prazo de entrega
  // (texto livre: "15 dias úteis", "48h"…) e nº de revisões inclusas.
  paymentCondition: text("payment_condition"),
  deliveryDeadline: text("delivery_deadline"),
  revisionsCount: integer("revisions_count"),
  createdAt: ts("created_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Uma proposta publicada por orçamento; a reemissão revoga o link anterior.
export const budgetSales = pgTable("kbos_budget_sales", {
  companyProfile: jsonb("company_profile").$type<import("./planning-model").CompanyProfile>(),
  id: uuid("id").primaryKey().defaultRandom(),
  budgetId: uuid("budget_id").notNull().unique().references(() => budgets.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(),
  budgetVersion: timestamp("budget_version", { withTimezone: true }).notNull(),
  snapshot: jsonb("snapshot").notNull().$type<import("./sales").SaleSnapshot>(),
  plan: jsonb("plan").notNull().$type<import("./sale-plan").SalePlan>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  signerName: text("signer_name"),
  contractAccepted: boolean("contract_accepted").notNull().default(false),
  manualAccepted: boolean("manual_accepted").notNull().default(false),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
  createdAt: ts("created_at"),
});

// Binários preservados no banco, fora dos arquivos temporários do contêiner.
const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const budgetUploads = pgTable("kbos_budget_uploads", {
  source: text("source").notNull().default("admin"),
  id: uuid("id").primaryKey().defaultRandom(),
  budgetId: uuid("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  content: binary("content").notNull(),
  createdAt: ts("created_at"),
});

export const clientPlans = pgTable("kbos_client_plans", {
 shareTokenHash: text("share_token_hash").unique(),
 id: uuid("id").primaryKey().defaultRandom(),
 saleId: uuid("sale_id").notNull().unique().references(() => budgetSales.id, { onDelete: "restrict" }),
 projectId: uuid("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
 signedProfile: jsonb("signed_profile").notNull().$type<import("./planning-model").CompanyProfile>(),
 draft: jsonb("draft").notNull().$type<import("./planning-model").PlanDocument>(),
 draftRevision: integer("draft_revision").notNull().default(1),
 published: jsonb("published").$type<import("./planning-model").PlanDocument>(),
 version: integer("version").notNull().default(0),
 status: text("status").notNull().default("draft"),
 feedback: jsonb("feedback").notNull().$type<import("./planning-model").PlanReview[]>().default([]),
 approvedAt: timestamp("approved_at", { withTimezone: true }),
 createdAt: ts("created_at"), updatedAt: ts("updated_at"),
});

export const authChallenges = pgTable("kbos_auth_challenges", {
 id: uuid("id").primaryKey().defaultRandom(),
 userId: uuid("user_id").notNull().references(() => users.id, {onDelete:"cascade"}),
 codeHash: text("code_hash").notNull(), channel: text("channel").notNull(),
 attempts: integer("attempts").notNull().default(0), consumed: boolean("consumed").notNull().default(false),
 expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(), createdAt: ts("created_at"),
});

/** Catálogo de serviços editável (0016). Só guarda o que o Kayque sobrescreve;
 * campo nulo = usa o padrão de `briefing-forms.ts`. Fonte única do site e do KBOS. */
export const services = pgTable("kbos_services", {
  slug: text("slug").primaryKey(),
  label: text("label"),
  tagline: text("tagline"),
  description: text("description"),
  priceFrom: numeric("price_from"),
  term: text("term"),
  includes: jsonb("includes").$type<string[]>(),
  pitch: jsonb("pitch").$type<string[]>(),
  process: jsonb("process").$type<{ title: string; desc: string }[]>(),
  active: boolean("active").notNull().default(true),
  updatedAt: ts("updated_at"),
});

/** Cases do portfólio (0017). Um case pode vir de um projeto; só vai ao ar
 * com autorização válida (ver `showcase-model.ts`). Os cases antigos do
 * código (`lib/data.ts`) continuam valendo até existir uma linha com o mesmo slug. */
export const showcases = pgTable("kbos_showcases", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),
  basis: text("basis").notNull().default("consent"),
  service: text("service").notNull().default("audiovisual"),
  title: text("title").notNull(),
  category: text("category"),
  clientName: text("client_name"),
  clientLogo: text("client_logo"),
  year: text("year"),
  description: text("description"),
  longDescription: text("long_description"),
  about: jsonb("about").$type<string[]>(),
  img: text("img"),
  gallery: jsonb("gallery").$type<string[]>(),
  videoLabel: text("video_label"),
  videoId: text("video_id"),
  siteUrl: text("site_url"),
  metrics: text("metrics"),
  testimonial: text("testimonial"),
  testimonialAuthor: text("testimonial_author"),
  contentHash: text("content_hash"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

/** Pedido de autorização enviado ao cliente (link seguro, guardado só o hash). */
export const showcaseConsents = pgTable("kbos_showcase_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  showcaseId: uuid("showcase_id").notNull().references(() => showcases.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"),
  requestedScopes: jsonb("requested_scopes").$type<string[]>().notNull(),
  grantedScopes: jsonb("granted_scopes").$type<string[]>(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  contentHash: text("content_hash").notNull(),
  signerName: text("signer_name"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: ts("created_at"),
});


/** Galeria do cliente: álbum por captação, acesso por link privado (guardado só o hash). */
export const albums = pgTable("kbos_albums", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  title: text("title").notNull(),
  brand: text("brand").notNull().default(""),
  eventDate: text("event_date"),
  status: text("status").notNull().default("draft"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  createdAt: ts("created_at"),
});

export const albumPhotos = pgTable("kbos_album_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: uuid("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  width: integer("width"),
  height: integer("height"),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  downloads: integer("downloads").notNull().default(0),
  createdAt: ts("created_at"),
});

/** Uma linha por foto autorizada: quem autorizou, qual texto, quando. revoked_at = cliente retirou a autorização. */
export const albumAuthorizations = pgTable("kbos_album_authorizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: uuid("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
  photoId: uuid("photo_id").notNull().references(() => albumPhotos.id, { onDelete: "cascade" }),
  signerName: text("signer_name").notNull(),
  signerPhone: text("signer_phone").notNull(),
  consentVersion: text("consent_version").notNull(),
  acceptedAt: ts("accepted_at"),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
