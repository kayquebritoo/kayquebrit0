// Unitários do LMS — regras puras + schemas (sem I/O).
import { describe, expect, it } from "vitest";
import { isConflict, isLessonUnlocked, slugify, unlocksAt } from "../lms";
import {
  courseCreateSchema,
  enrollmentCreateSchema,
  lessonCreateSchema,
  moduleCreateSchema,
  progressCompleteSchema,
} from "../validators";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("slugify", () => {
  it("gera slug url-safe (acentos, caixas, espaços)", () => {
    expect(slugify("Fotografia Avançada & Direção!")).toBe("fotografia-avancada-direcao");
    expect(slugify("  Next.js do Zero  ")).toBe("next-js-do-zero");
  });
});

describe("isLessonUnlocked", () => {
  const enrolled = new Date("2026-01-01T00:00:00Z");
  it("drip 0 = imediato", () => {
    expect(isLessonUnlocked(enrolled, 0, enrolled)).toBe(true);
  });
  it("drip 7: bloqueada no dia 3, livre no dia 8", () => {
    const d3 = new Date("2026-01-04T00:00:00Z");
    const d8 = new Date("2026-01-09T00:00:00Z");
    expect(isLessonUnlocked(enrolled, 7, d3)).toBe(false);
    expect(isLessonUnlocked(enrolled, 7, d8)).toBe(true);
    expect(unlocksAt(enrolled, 7).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});

describe("isConflict", () => {
  it("detecta 23505 mesmo embrulhado (DrizzleQueryError.cause)", () => {
    const inner = Object.assign(new Error("duplicate key"), { code: "23505" });
    const wrapped = Object.assign(new Error("Failed query"), { cause: inner });
    expect(isConflict(wrapped)).toBe(true);
    expect(isConflict(inner)).toBe(true);
    expect(isConflict(new Error("outro"))).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});

describe("schemas LMS", () => {
  it("courseCreate mínimo passa; slug ruim cai", () => {
    expect(courseCreateSchema.safeParse({ titulo: "Curso X" }).success).toBe(true);
    expect(courseCreateSchema.safeParse({ titulo: "X", slug: "Slug Ruim!" }).success).toBe(false);
    expect(courseCreateSchema.safeParse({}).success).toBe(false);
  });
  it("module/lesson exigem pai uuid + título", () => {
    expect(moduleCreateSchema.safeParse({ courseId: UUID, titulo: "M1" }).success).toBe(true);
    expect(moduleCreateSchema.safeParse({ courseId: "x", titulo: "M1" }).success).toBe(false);
    expect(
      lessonCreateSchema.safeParse({ moduleId: UUID, titulo: "A1", dripDays: 7 }).success
    ).toBe(true);
    expect(
      lessonCreateSchema.safeParse({ moduleId: UUID, titulo: "A1", dripDays: -1 }).success
    ).toBe(false);
  });
  it("enrollment exige courseId; progress exige os dois uuids", () => {
    expect(enrollmentCreateSchema.safeParse({ courseId: UUID }).success).toBe(true);
    expect(enrollmentCreateSchema.safeParse({}).success).toBe(false);
    expect(progressCompleteSchema.safeParse({ enrollmentId: UUID, lessonId: UUID }).success).toBe(
      true
    );
    expect(progressCompleteSchema.safeParse({ enrollmentId: UUID }).success).toBe(false);
  });
});
