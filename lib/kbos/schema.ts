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

export type Role = (typeof roleEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatus.enumValues)[number];
