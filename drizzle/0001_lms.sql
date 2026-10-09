CREATE TYPE "public"."kbos_course_status" AS ENUM('rascunho', 'publicado', 'arquivado');--> statement-breakpoint
CREATE TYPE "public"."kbos_enrollment_status" AS ENUM('pendente', 'ativa', 'pausada', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."kbos_lesson_type" AS ENUM('video', 'texto', 'quiz', 'arquivo');--> statement-breakpoint
CREATE TABLE "kbos_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"emitida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kbos_certificates_enrollment_id_unique" UNIQUE("enrollment_id"),
	CONSTRAINT "kbos_certificates_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "kbos_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"slug" text NOT NULL,
	"descricao" text,
	"preco" numeric,
	"capa" text,
	"status" "kbos_course_status" DEFAULT 'rascunho' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kbos_courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "kbos_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "kbos_enrollment_status" DEFAULT 'pendente' NOT NULL,
	"transaction_id" uuid,
	"progresso_pct" numeric DEFAULT '0' NOT NULL,
	"concluido_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"concluida" boolean DEFAULT false NOT NULL,
	"concluida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"tipo" "kbos_lesson_type" DEFAULT 'video' NOT NULL,
	"video_url" text,
	"conteudo" text,
	"duracao_min" integer,
	"ordem" integer DEFAULT 0 NOT NULL,
	"drip_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbos_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kbos_certificates" ADD CONSTRAINT "kbos_certificates_enrollment_id_kbos_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."kbos_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_enrollments" ADD CONSTRAINT "kbos_enrollments_course_id_kbos_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."kbos_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_enrollments" ADD CONSTRAINT "kbos_enrollments_user_id_kbos_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."kbos_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_enrollments" ADD CONSTRAINT "kbos_enrollments_transaction_id_kbos_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."kbos_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_lesson_progress" ADD CONSTRAINT "kbos_lesson_progress_enrollment_id_kbos_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."kbos_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_lesson_progress" ADD CONSTRAINT "kbos_lesson_progress_lesson_id_kbos_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."kbos_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_lessons" ADD CONSTRAINT "kbos_lessons_module_id_kbos_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."kbos_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kbos_modules" ADD CONSTRAINT "kbos_modules_course_id_kbos_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."kbos_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kbos_enrollments_user_course_unique" ON "kbos_enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kbos_lesson_progress_unique" ON "kbos_lesson_progress" USING btree ("enrollment_id","lesson_id");