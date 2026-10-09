// Regras do LMS — puras quando possível (testáveis sem I/O).
// completeLesson/getProgressSummary concentram a lógica; as rotas só
// traduzem LmsError → HTTP.
import { randomBytes } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { slugify } from "./lms-client";
import {
  certificates,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  transactions,
  users,
} from "./schema";
import { buildIdempotencyKey, enqueueJob } from "./jobs";

export class LmsError extends Error {
  constructor(
    public code: "not-found" | "forbidden" | "mismatch" | "locked" | "conflict",
    message: string
  ) {
    super(message);
  }
}

export function lmsStatus(code: LmsError["code"]) {
  return code === "not-found" ? 404 : code === "forbidden" ? 403 : code === "conflict" ? 409 : 423;
}

/** slug único (sufixo curto em colisão). */
export async function uniqueSlug(base: string) {
  const d = db();
  let slug = slugify(base) || "curso";
  for (let i = 0; i < 3; i++) {
    const hit = await d.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug)).limit(1);
    if (!hit[0]) return slug;
    slug = `${slugify(base)}-${randomBytes(2).toString("hex")}`;
  }
  return `${slugify(base)}-${Date.now().toString(36)}`;
}

/** Aula liberada? drip_days conta da data da matrícula. */
export function isLessonUnlocked(
  enrolledAt: Date,
  dripDays: number,
  now: Date = new Date()
) {
  if (dripDays <= 0) return true;
  return now.getTime() >= enrolledAt.getTime() + dripDays * 86_400_000;
}

export function unlocksAt(enrolledAt: Date, dripDays: number) {
  return new Date(enrolledAt.getTime() + Math.max(0, dripDays) * 86_400_000);
}

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Erro 23505 (unique violation) — o Drizzle embrulha em DrizzleQueryError.cause. */
export function isConflict(e: unknown) {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/* ---------- leitura ---------- */

export type LessonView = {
  id: string;
  moduleId: string;
  titulo: string;
  tipo: string;
  duracaoMin: number | null;
  ordem: number;
  dripDays: number;
  desbloqueada: boolean;
  liberaEm: string | null;
  concluida: boolean;
  videoUrl: string | null;
  conteudo: string | null;
};

export async function getCourseLessons(courseId: string) {
  const d = db();
  const mods = await d
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.ordem), asc(modules.createdAt));
  const out: { module: typeof mods[number]; lessons: (typeof lessons.$inferSelect)[] }[] = [];
  for (const m of mods) {
    const ls = await d
      .select()
      .from(lessons)
      .where(eq(lessons.moduleId, m.id))
      .orderBy(asc(lessons.ordem), asc(lessons.createdAt));
    out.push({ module: m, lessons: ls });
  }
  return out;
}

/** Resumo de progresso + aulas com trava de drip e de conteúdo. */
export async function getProgressSummary(
  enrollmentId: string,
  actor: { id: string; role: string },
  now: Date = new Date()
) {
  const d = db();
  const enr = (
    await d.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1)
  )[0];
  if (!enr) throw new LmsError("not-found", "Matrícula não encontrada.");
  if (actor.role === "cliente" && enr.userId !== actor.id) {
    throw new LmsError("forbidden", "Sem permissão.");
  }
  const tree = await getCourseLessons(enr.courseId);
  const done = await d.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enr.id));
  const doneSet = new Set(done.filter((p) => p.concluida).map((p) => p.lessonId));
  const canSeeContent = actor.role !== "cliente" || enr.userId === actor.id;

  let total = 0;
  const lessonViews: LessonView[] = [];
  for (const { lessons: ls } of tree) {
    for (const l of ls) {
      total++;
      const unlocked = isLessonUnlocked(enr.createdAt, l.dripDays, now);
      lessonViews.push({
        id: l.id,
        moduleId: l.moduleId,
        titulo: l.titulo,
        tipo: l.tipo,
        duracaoMin: l.duracaoMin,
        ordem: l.ordem,
        dripDays: l.dripDays,
        desbloqueada: unlocked,
        liberaEm: unlocked ? null : unlocksAt(enr.createdAt, l.dripDays).toISOString(),
        concluida: doneSet.has(l.id),
        videoUrl: canSeeContent && unlocked ? l.videoUrl : null,
        conteudo: canSeeContent && unlocked ? l.conteudo : null,
      });
    }
  }
  const concluidas = lessonViews.filter((l) => l.concluida).length;
  const pct = total === 0 ? 0 : Math.round((concluidas / total) * 100);
  const proxima = lessonViews.find((l) => l.desbloqueada && !l.concluida) ?? null;
  return { enrollment: enr, total, concluidas, pct, proxima: proxima?.id ?? null, aulas: lessonViews };
}

/* ---------- escrita ---------- */

export async function ensureCertificate(enrollmentId: string) {
  const d = db();
  const existing = (
    await d.select().from(certificates).where(eq(certificates.enrollmentId, enrollmentId)).limit(1)
  )[0];
  if (existing) return existing;
  for (let i = 0; i < 3; i++) {
    const codigo = `KBOS-${randomBytes(3).toString("hex").toUpperCase()}-${randomBytes(3)
      .toString("hex")
      .toUpperCase()}`;
    try {
      const rows = await d.insert(certificates).values({ enrollmentId, codigo }).returning();
      return rows[0];
    } catch (e) {
      if (!isConflict(e) || i === 2) throw e;
    }
  }
  throw new Error("Falha ao emitir certificado.");
}

/**
 * Marca aula como concluída (idempotente). Em 100% conclui a matrícula,
 * emite o certificado e avisa no WhatsApp — tudo com chaves idempotentes.
 */
export async function completeLesson(
  enrollmentId: string,
  lessonId: string,
  actor: { id: string; role: string },
  now: Date = new Date()
) {
  const d = db();
  const enr = (
    await d.select().from(enrollments).where(eq(enrollments.id, enrollmentId)).limit(1)
  )[0];
  if (!enr) throw new LmsError("not-found", "Matrícula não encontrada.");
  if (actor.role === "cliente" && enr.userId !== actor.id) {
    throw new LmsError("forbidden", "Sem permissão.");
  }
  if (enr.status === "cancelada") throw new LmsError("conflict", "Matrícula cancelada.");
  const les = (await d.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1))[0];
  if (!les) throw new LmsError("not-found", "Aula não encontrada.");
  const mod = (await d.select().from(modules).where(eq(modules.id, les.moduleId)).limit(1))[0];
  if (!mod || mod.courseId !== enr.courseId) {
    throw new LmsError("mismatch", "Aula não pertence ao curso da matrícula.");
  }
  if (!isLessonUnlocked(enr.createdAt, les.dripDays, now)) {
    throw new LmsError("locked", "Aula ainda bloqueada pelo cronograma.");
  }

  const existing = (
    await d
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.enrollmentId, enr.id), eq(lessonProgress.lessonId, les.id)))
      .limit(1)
  )[0];
  if (!existing) {
    await d.insert(lessonProgress).values({
      enrollmentId: enr.id,
      lessonId: les.id,
      concluida: true,
      concluidaEm: now,
    });
  } else if (!existing.concluida) {
    await d
      .update(lessonProgress)
      .set({ concluida: true, concluidaEm: now })
      .where(eq(lessonProgress.id, existing.id));
  }

  const summary = await getProgressSummary(enr.id, actor, now);
  await d
    .update(enrollments)
    .set({ progressoPct: String(summary.pct), updatedAt: now })
    .where(eq(enrollments.id, enr.id));

  let certificado: string | null = null;
  if (summary.total > 0 && summary.pct === 100 && enr.status !== "concluida") {
    await d
      .update(enrollments)
      .set({ status: "concluida", concluidoEm: now, updatedAt: now })
      .where(eq(enrollments.id, enr.id));
    const cert = await ensureCertificate(enr.id);
    certificado = cert.codigo;
    try {
      const aluno = (
        await d.select().from(users).where(eq(users.id, enr.userId)).limit(1)
      )[0];
      if (aluno?.phone) {
        await enqueueJob(
          "notify.whatsapp",
          {
            destino: aluno.phone,
            mensagem:
              `*KBOS — Curso concluído!* 🎓\nParabéns, ${aluno.name}! ` +
              `Seu certificado: *${cert.codigo}*`,
            evento: "lms.conclusao",
          },
          { key: buildIdempotencyKey("lms-conclusao", { enrollment: enr.id }) }
        );
      }
    } catch {
      /* progresso não pode falhar por causa do aviso */
    }
  }
  return { ...summary, certificado };
}

export function welcomeMessage(nome: string, curso: string) {
  return (
    `*KBOS — Bem-vindo(a) ao ${curso}!* 🎓\n` +
    `Olá ${nome}! Sua matrícula está confirmada.\n` +
    `Acesse suas aulas aqui: ${appUrl()}/portal\nBons estudos!`
  );
}

/* ---------- checkout ---------- */

export type CheckoutReady = {
  enrollment: typeof enrollments.$inferSelect;
  transaction: typeof transactions.$inferSelect;
  reused: boolean;
};

/**
 * Prepara o checkout: valida curso (publicado + preço), reaproveita matrícula
 * pendente/pausada ou cria uma nova + transação `pendente` vinculada.
 * 409 se já existe matrícula ativa/concluída. Preço SEMPRE do banco.
 */
export async function createCheckoutEnrollment(
  userId: string,
  courseId: string
): Promise<CheckoutReady> {
  const d = db();
  const course = (
    await d.select().from(courses).where(eq(courses.id, courseId)).limit(1)
  )[0];
  if (!course) throw new LmsError("not-found", "Curso não encontrado.");
  if (course.status !== "publicado") throw new LmsError("conflict", "Curso indisponível para venda.");
  const preco = Number(course.preco ?? 0);
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new LmsError("conflict", "Curso sem preço definido.");
  }

  const mine = await d
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
    .limit(1);
  const existing = mine[0];
  if (existing && (existing.status === "ativa" || existing.status === "concluida")) {
    throw new LmsError("conflict", "Você já está matriculado neste curso.");
  }
  if (existing && existing.status !== "cancelada") {
    const trx = existing.transactionId
      ? (
          await d.select().from(transactions).where(eq(transactions.id, existing.transactionId)).limit(1)
        )[0]
      : undefined;
    if (!trx) throw new LmsError("not-found", "Transação da matrícula sumiu — fale com o suporte.");
    return { enrollment: existing, transaction: trx, reused: true };
  }

  try {
    const trxRows = await d
      .insert(transactions)
      .values({
        tipo: "entrada",
        descricao: `Matrícula — ${course.titulo}`,
        categoria: "lms",
        valor: String(preco),
        status: "pendente",
      })
      .returning();
    const enrRows = await d
      .insert(enrollments)
      .values({ courseId, userId, status: "pendente", transactionId: trxRows[0].id })
      .returning();
    return { enrollment: enrRows[0], transaction: trxRows[0], reused: false };
  } catch (e) {
    if (isConflict(e)) throw new LmsError("conflict", "Você já está matriculado neste curso.");
    throw e;
  }
}

/* ---------- verificação pública de certificado ---------- */

export type CertificateCheck =
  | { valido: true; codigo: string; curso: string; aluno: string; emitidaEm: string }
  | { valido: false };

export async function verifyCertificate(codigoRaw: string): Promise<CertificateCheck> {
  const codigo = codigoRaw.trim().toUpperCase();
  if (!codigo) return { valido: false };
  const d = db();
  const cert = (
    await d.select().from(certificates).where(eq(certificates.codigo, codigo)).limit(1)
  )[0];
  if (!cert) return { valido: false };
  const enr = (
    await d.select().from(enrollments).where(eq(enrollments.id, cert.enrollmentId)).limit(1)
  )[0];
  const course = enr
    ? (await d.select().from(courses).where(eq(courses.id, enr.courseId)).limit(1))[0]
    : undefined;
  const aluno = enr
    ? (await d.select().from(users).where(eq(users.id, enr.userId)).limit(1))[0]
    : undefined;
  if (!enr || !course || !aluno) return { valido: false };
  return {
    valido: true,
    codigo: cert.codigo,
    curso: course.titulo,
    aluno: aluno.name,
    emitidaEm: cert.emitidaEm.toISOString(),
  };
}
