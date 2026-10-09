CREATE TYPE "public"."kbos_briefing_status" AS ENUM('novo', 'em_analise', 'aprovado', 'contrato_gerado', 'arquivado');--> statement-breakpoint
CREATE TYPE "public"."kbos_file_status" AS ENUM('enviado', 'aprovado', 'reprovado');--> statement-breakpoint
CREATE TYPE "public"."kbos_job_status" AS ENUM('pendente', 'ativo', 'concluido', 'falha', 'morto');--> statement-breakpoint
CREATE TYPE "public"."kbos_notif_status" AS ENUM('pendente', 'enviado', 'falha');--> statement-breakpoint
CREATE TYPE "public"."kbos_project_status" AS ENUM('novo', 'briefing', 'producao', 'revisao', 'aprovado', 'entregue');--> statement-breakpoint
CREATE TYPE "public"."kbos_role" AS ENUM('admin', 'designer', 'editor', 'fotografo', 'programador', 'cliente');--> statement-breakpoint
CREATE TYPE "public"."kbos_task_status" AS ENUM('todo', 'doing', 'done');--> statement-breakpoint
CREATE TYPE "public"."kbos_trx_status" AS ENUM('pendente', 'pago', 'vencido');--> statement-breakpoint
CREATE TYPE "public"."kbos_trx_tipo" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TABLE "kbos_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria" text NOT NULL,
	"cliente_nome" text NOT NULL,
	"cliente_email" text NOT NULL,
	"cliente_tel" text,
	"respostas" jsonb NOT NULL,
	"status" "kbos_briefing_status" DEFAULT 'novo' NOT NULL,
	"valor_estimado" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "kbos_job_status" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"max_tentativas" integer DEFAULT 5 NOT NULL,
	"proxima_tentativa" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"bullmq_id" text,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kbos_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "kbos_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kbos_login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "kbos_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" text DEFAULT 'whatsapp' NOT NULL,
	"destino" text NOT NULL,
	"mensagem" text NOT NULL,
	"evento" text,
	"status" "kbos_notif_status" DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'entrega' NOT NULL,
	"status" "kbos_file_status" DEFAULT 'enviado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"categoria" text NOT NULL,
	"cliente_id" uuid,
	"briefing_id" uuid,
	"status" "kbos_project_status" DEFAULT 'novo' NOT NULL,
	"valor" numeric,
	"prazo" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"responsavel_role" text,
	"status" "kbos_task_status" DEFAULT 'todo' NOT NULL,
	"estimativa_min" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"user_id" uuid NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"fim" timestamp with time zone,
	"segundos" integer
);
--> statement-breakpoint
CREATE TABLE "kbos_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "kbos_trx_tipo" NOT NULL,
	"descricao" text NOT NULL,
	"categoria" text,
	"valor" numeric NOT NULL,
	"vencimento" timestamp with time zone,
	"status" "kbos_trx_status" DEFAULT 'pendente' NOT NULL,
	"project_id" uuid,
	"gateway_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "kbos_role" DEFAULT 'cliente' NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kbos_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "kbos_project_files" ADD CONSTRAINT "kbos_project_files_project_id_kbos_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."kbos_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD CONSTRAINT "kbos_projects_cliente_id_kbos_users_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."kbos_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_projects" ADD CONSTRAINT "kbos_projects_briefing_id_kbos_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."kbos_briefings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_sessions" ADD CONSTRAINT "kbos_sessions_user_id_kbos_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."kbos_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_tasks" ADD CONSTRAINT "kbos_tasks_project_id_kbos_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."kbos_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_time_entries" ADD CONSTRAINT "kbos_time_entries_project_id_kbos_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."kbos_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_time_entries" ADD CONSTRAINT "kbos_time_entries_task_id_kbos_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."kbos_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_time_entries" ADD CONSTRAINT "kbos_time_entries_user_id_kbos_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."kbos_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_transactions" ADD CONSTRAINT "kbos_transactions_project_id_kbos_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."kbos_projects"("id") ON DELETE set null ON UPDATE no action;