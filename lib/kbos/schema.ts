// Schema KBOS — todas as tabelas do ecossistema.
// Convenção: ids uuid, timestamps com timezone, valores em `numeric`.
import {
  boolean,
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
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("cliente"),
  phone: text("phone"),
  createdAt: ts("created_at"),
});

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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  responsavelRole: text("responsavel_role"),
  status: taskStatus("status").notNull().default("todo"),
  estimativaMin: integer("estimativa_min"),
  createdAt: ts("created_at"),
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
  createdAt: ts("created_at"),
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
