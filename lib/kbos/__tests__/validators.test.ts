// Unitários da Fase 0 — validadores Zod (sem I/O).
import { describe, expect, it } from "vitest";
import {
  authRequestSchema,
  briefingCreateSchema,
  fileCreateSchema,
  fileReviewSchema,
  moneyField,
  projectCreateSchema,
  projectPatchSchema,
  taskCreateSchema,
  taskPatchSchema,
  timeSchema,
  transactionCreateSchema,
  transactionPatchSchema,
  uuidField,
} from "../validators";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("uuidField", () => {
  it("aceita uuid e rejeita lixo", () => {
    expect(uuidField.safeParse(UUID).success).toBe(true);
    expect(uuidField.safeParse("nao-uuid").success).toBe(false);
    expect(uuidField.safeParse("1'; DROP TABLE x;--").success).toBe(false);
  });
});

describe("authRequestSchema", () => {
  it("normaliza e-mail (trim + minúsculas)", () => {
    const r = authRequestSchema.safeParse({ email: "  USER@Mail.COM " });
    expect(r.success && r.data.email).toBe("user@mail.com");
  });
  it("rejeita e-mail inválido", () => {
    expect(authRequestSchema.safeParse({ email: "nao-email" }).success).toBe(false);
    expect(authRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("briefingCreateSchema", () => {
  it("aceita corpo válido", () => {
    expect(
      briefingCreateSchema.safeParse({ categoria: "video", respostas: { nome: "A" } }).success
    ).toBe(true);
  });
  it("rejeita sem categoria, sem respostas ou respostas não-string", () => {
    expect(briefingCreateSchema.safeParse({ respostas: {} }).success).toBe(false);
    expect(briefingCreateSchema.safeParse({ categoria: "video" }).success).toBe(false);
    expect(
      briefingCreateSchema.safeParse({ categoria: "video", respostas: { x: 123 } }).success
    ).toBe(false);
  });
});

describe("projectCreateSchema / projectPatchSchema", () => {
  it("cria com mínimo e rejeita sem título", () => {
    expect(projectCreateSchema.safeParse({ titulo: "Site", categoria: "dev" }).success).toBe(true);
    expect(projectCreateSchema.safeParse({ categoria: "dev" }).success).toBe(false);
  });
  it("rejeita uuid/clienteEmail inválidos", () => {
    expect(
      projectCreateSchema.safeParse({ titulo: "T", categoria: "C", clienteId: "x" }).success
    ).toBe(false);
    expect(
      projectCreateSchema.safeParse({ titulo: "T", categoria: "C", clienteEmail: "x" }).success
    ).toBe(false);
  });
  it("PATCH vazio é 400 em potencial; PATCH válido passa", () => {
    expect(projectPatchSchema.safeParse({}).success).toBe(false);
    expect(projectPatchSchema.safeParse({ status: "producao" }).success).toBe(true);
    expect(projectPatchSchema.safeParse({ status: "invalido" }).success).toBe(false);
  });
});

describe("moneyField", () => {
  it("aceita string decimal ou número positivo", () => {
    expect(moneyField.safeParse("1500").data).toBe("1500");
    expect(moneyField.safeParse("1500.50").data).toBe("1500.50");
    expect(moneyField.safeParse(1500).data).toBe("1500");
  });
  it("rejeita formatos ruins", () => {
    for (const v of ["abc", "15,00", "1.5.2", "-10", -5, ""]) {
      expect(moneyField.safeParse(v).success).toBe(false);
    }
  });
});

describe("files / tasks / time / transactions", () => {
  it("fileCreate exige nome+url válida; kind inválido cai", () => {
    expect(
      fileCreateSchema.safeParse({ nome: "a", url: "https://x.com/f.pdf" }).success
    ).toBe(true);
    expect(fileCreateSchema.safeParse({ nome: "a", url: "nota-url" }).success).toBe(false);
    expect(
      fileCreateSchema.safeParse({ nome: "a", url: "https://x.com/f", kind: "zzz" }).success
    ).toBe(false);
  });
  it("fileReview só aprovado/reprovado", () => {
    expect(fileReviewSchema.safeParse({ status: "aprovado" }).success).toBe(true);
    expect(fileReviewSchema.safeParse({ status: "talvez" }).success).toBe(false);
  });
  it("taskCreate exige projectId uuid + título; Patch vazio cai", () => {
    expect(taskCreateSchema.safeParse({ projectId: UUID, titulo: "T" }).success).toBe(true);
    expect(taskCreateSchema.safeParse({ projectId: "x", titulo: "T" }).success).toBe(false);
    expect(taskPatchSchema.safeParse({}).success).toBe(false);
  });
  it("time só start/stop com projectId uuid", () => {
    expect(timeSchema.safeParse({ action: "start", projectId: UUID }).success).toBe(true);
    expect(timeSchema.safeParse({ action: "pausar", projectId: UUID }).success).toBe(false);
  });
  it("transactionCreate exige tipo/descricao/valor; Patch vazio cai", () => {
    expect(
      transactionCreateSchema.safeParse({ tipo: "entrada", descricao: "D", valor: "100" }).success
    ).toBe(true);
    expect(
      transactionCreateSchema.safeParse({ tipo: "lado", descricao: "D", valor: "100" }).success
    ).toBe(false);
    expect(transactionPatchSchema.safeParse({}).success).toBe(false);
    expect(transactionPatchSchema.safeParse({ status: "pago" }).success).toBe(true);
  });
});
