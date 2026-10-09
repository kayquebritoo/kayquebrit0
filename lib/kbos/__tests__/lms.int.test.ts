// Integração do LMS — Postgres + Redis reais, com limpeza total.
//   npm run test:int
// Sem KBOS_TEST_REDIS=1, tudo é pulado.
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch {
  /* sem .env.local */
}

const RUN = !!process.env.KBOS_TEST_REDIS && !!process.env.DATABASE_URL;

const { db } = await import("../db");
const { certificates, courses, enrollments, lessonProgress, lessons, modules, users } =
  await import("../schema");
const { completeLesson, ensureCertificate, getProgressSummary } = await import("../lms");
const { enqueueJob, getQueue } = await import("../jobs");
const { processJob } = await import("../../../worker/runner");

const TAG = `lms-t-${randomUUID().slice(0, 8)}`;
const createdJobKeys: string[] = [];
const created = { users: [] as string[], courses: [] as string[], enrollments: [] as string[] };

afterEach(async () => {
  if (!RUN) return;
  try {
    const q = getQueue();
    for (const key of createdJobKeys.splice(0)) {
      try {
        await (await q.getJob(key))?.remove();
      } catch {
        /* já finalizado */
      }
    }
  } catch {
    /* sem Redis */
  }
  const d = db();
  for (const id of created.enrollments.splice(0)) {
    await d.delete(lessonProgress).where(eq(lessonProgress.enrollmentId, id));
    await d.delete(certificates).where(eq(certificates.enrollmentId, id));
    await d.delete(enrollments).where(eq(enrollments.id, id));
  }
  for (const id of created.courses.splice(0)) {
    const mods = await d.select().from(modules).where(eq(modules.courseId, id));
    for (const m of mods) await d.delete(lessons).where(eq(lessons.moduleId, m.id));
    await d.delete(modules).where(eq(modules.courseId, id));
    await d.delete(courses).where(eq(courses.id, id));
  }
  for (const id of created.users.splice(0)) {
    await d.delete(users).where(eq(users.id, id));
  }
});

async function makeUser(phone: string | null = null) {
  const rows = await db()
    .insert(users)
    .values({ email: `${TAG}-${randomUUID().slice(0, 6)}@t.com`, name: "Aluno T", role: "cliente", phone })
    .returning();
  created.users.push(rows[0].id);
  return rows[0];
}

describe.skipIf(!RUN)("LMS (db+redis)", () => {
  it("fluxo completo: matrícula → progresso 50% → 100% + certificado", async () => {
    const aluno = await makeUser("5591999999999");
    const course = await makeCourseLessonsSetup();
    const mods = await db().select().from(modules).where(eq(modules.courseId, course.id));
    const all = (
      await Promise.all(mods.map((m) => db().select().from(lessons).where(eq(lessons.moduleId, m.id))))
    ).flat();
    expect(all.length).toBe(2);

    const enr = (
      await db().insert(enrollments).values({ courseId: course.id, userId: aluno.id, status: "ativa" }).returning()
    )[0];
    created.enrollments.push(enr.id);
    const actor = { id: aluno.id, role: "cliente" };

    const s1 = await completeLesson(enr.id, all[0].id, actor);
    expect(s1.pct).toBe(50);
    expect(s1.certificado).toBeNull();

    // idempotência: concluir de novo não duplica nem quebra
    const s1b = await completeLesson(enr.id, all[0].id, actor);
    expect(s1b.pct).toBe(50);

    const s2 = await completeLesson(enr.id, all[1].id, actor);
    expect(s2.pct).toBe(100);
    expect(s2.certificado).toMatch(/^KBOS-/);

    const cert = await ensureCertificate(enr.id);
    expect(cert.codigo).toBe(s2.certificado);

    const sum = await getProgressSummary(enr.id, actor);
    expect(sum.concluidas).toBe(2);
    expect(sum.proxima).toBeNull();
  }, 60_000);

  it("drip bloqueia aula futura (423 em potencial)", async () => {
    const aluno = await makeUser();
    const course = await makeCourseLessonsSetup(30); // segunda aula com drip 30 dias
    const mods = await db().select().from(modules).where(eq(modules.courseId, course.id));
    const all = (
      await Promise.all(mods.map((m) => db().select().from(lessons).where(eq(lessons.moduleId, m.id))))
    ).flat();
    const enr = (
      await db().insert(enrollments).values({ courseId: course.id, userId: aluno.id, status: "ativa" }).returning()
    )[0];
    created.enrollments.push(enr.id);
    await expect(
      completeLesson(enr.id, all[1].id, { id: aluno.id, role: "cliente" })
    ).rejects.toMatchObject({ code: "locked" });
  }, 60_000);

  it("aula de outro curso = mismatch; aluno alheio = forbidden", async () => {
    const a1 = await makeUser();
    const a2 = await makeUser();
    const c1 = await makeCourseLessonsSetup();
    const c2 = await makeCourseLessonsSetup();
    const l2 = (
      await db().select().from(lessons).where(eq(lessons.moduleId, (await db().select().from(modules).where(eq(modules.courseId, c2.id)))[0].id))
    )[0];
    const enr = (
      await db().insert(enrollments).values({ courseId: c1.id, userId: a1.id, status: "ativa" }).returning()
    )[0];
    created.enrollments.push(enr.id);
    await expect(completeLesson(enr.id, l2.id, { id: a1.id, role: "cliente" })).rejects.toMatchObject({
      code: "mismatch",
    });
    const l1 = (
      await db().select().from(lessons).where(eq(lessons.moduleId, (await db().select().from(modules).where(eq(modules.courseId, c1.id)))[0].id))
    )[0];
    await expect(completeLesson(enr.id, l1.id, { id: a2.id, role: "cliente" })).rejects.toMatchObject({
      code: "forbidden",
    });
  }, 60_000);

  it("welcome: sem telefone = skip; com telefone = enfileira notify", async () => {
    const semFone = await makeUser(null);
    const r1 = await processJob({
      id: `test--${randomUUID()}`,
      name: "lms.welcome",
      data: { enrollmentId: "00000000-0000-0000-0000-000000000000" },
      updateData: async () => {},
    } as never).catch((e: Error) => e);
    // matrícula inexistente → irrecuperável (não retry)
    expect((r1 as Error).name).toBe("UnrecoverableError");

    const course = await makeCourseLessonsSetup();
    const enr = (
      await db().insert(enrollments).values({ courseId: course.id, userId: semFone.id, status: "ativa" }).returning()
    )[0];
    created.enrollments.push(enr.id);
    const r2 = await processJob({
      id: `test--${randomUUID()}`,
      name: "lms.welcome",
      data: { enrollmentId: enr.id },
      updateData: async () => {},
    } as never);
    expect(r2).toMatchObject({ skipped: true });

    const comFone = await makeUser("5591888888888");
    const enr2 = (
      await db().insert(enrollments).values({ courseId: course.id, userId: comFone.id, status: "ativa" }).returning()
    )[0];
    created.enrollments.push(enr2.id);
    const key = `test--${randomUUID()}`;
    createdJobKeys.push(key);
    const r3 = await enqueueJob("lms.welcome", { enrollmentId: enr2.id }, { key });
    expect(r3.queued).toBe(true);
    const r3b = await enqueueJob("lms.welcome", { enrollmentId: enr2.id }, { key });
    expect(r3b.deduped).toBe(true);
  }, 60_000);
});

async function makeCourseLessonsSetup(dripSecond = 0) {
  const d = db();
  const c = (
    await d
      .insert(courses)
      .values({ titulo: `Curso T ${TAG}`, slug: `curso-t-${TAG}-${randomUUID().slice(0, 6)}`, status: "publicado" })
      .returning()
  )[0];
  created.courses.push(c.id);
  const m = (await d.insert(modules).values({ courseId: c.id, titulo: "M1", ordem: 0 }).returning())[0];
  await d.insert(lessons).values({ moduleId: m.id, titulo: "A1", ordem: 0, dripDays: 0 });
  await d.insert(lessons).values({ moduleId: m.id, titulo: "A2", ordem: 1, dripDays: dripSecond });
  return c;
}
