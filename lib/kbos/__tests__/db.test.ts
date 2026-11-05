import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetDbForTests,
  assertAllowedDatabaseUrl,
  db,
  extractDbHost,
  isDeprecatedNeonHost,
} from "../db";
import { budgetCreateSchema, contactCreateSchema, taskCreateSchema } from "../validators";
import { buildBudget1Payload, buildBudget2Payload, buildContactPayload, buildTaskPayload } from "../../../scripts/recover-luana-prod.mjs";

describe("proteção contra cluster Neon descontinuado (lib/kbos/db.ts)", () => {
  const origUrl = process.env.DATABASE_URL;
  const origAllow = process.env.KBOS_ALLOW_DEPRECATED_NEON;
  const origDriver = process.env.DATABASE_DRIVER;

  beforeEach(() => {
    _resetDbForTests();
    delete process.env.KBOS_ALLOW_DEPRECATED_NEON;
  });

  afterEach(() => {
    _resetDbForTests();
    if (origUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = origUrl;
    if (origAllow === undefined) delete process.env.KBOS_ALLOW_DEPRECATED_NEON;
    else process.env.KBOS_ALLOW_DEPRECATED_NEON = origAllow;
    if (origDriver === undefined) delete process.env.DATABASE_DRIVER;
    else process.env.DATABASE_DRIVER = origDriver;
  });

  it("extrai apenas o host sem expor usuário ou senha", () => {
    const fakeSecret = "super_secret_password_12345";
    const url = `postgresql://neondb_owner:${fakeSecret}@ep-dawn-wildflower-b5k6i390-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`;
    const host = extractDbHost(url);
    expect(host).toBe("ep-dawn-wildflower-b5k6i390-pooler.c-7.us-east-2.aws.neon.tech");
    expect(host).not.toContain(fakeSecret);
    expect(host).not.toContain("neondb_owner");
    expect(isDeprecatedNeonHost(host)).toBe(true);
  });

  it("bloqueia conexão ao Neon antigo por padrão sem vazar credenciais no erro", () => {
    const fakeSecret = "senha_jamais_exposta_999";
    process.env.DATABASE_URL = `postgresql://user:${fakeSecret}@ep-dawn-wildflower-b5k6i390.c-7.us-east-2.aws.neon.tech/neondb`;
    let caught: Error | null = null;
    try {
      db();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain("ep-dawn-wildflower-b5k6i390.c-7.us-east-2.aws.neon.tech");
    expect(caught?.message).toContain("KBOS_ALLOW_DEPRECATED_NEON=1");
    expect(caught?.message).not.toContain(fakeSecret);
  });

  it("permite acesso excepcional ao Neon antigo somente quando KBOS_ALLOW_DEPRECATED_NEON=1", () => {
    const url =
      "postgresql://user:secret@ep-dawn-wildflower-b5k6i390.c-7.us-east-2.aws.neon.tech/neondb";
    process.env.KBOS_ALLOW_DEPRECATED_NEON = "1";
    expect(() => assertAllowedDatabaseUrl(url)).not.toThrow();
  });

  it("permite hosts PostgreSQL válidos (ex.: kbos-pg18 ou localhost)", () => {
    expect(() =>
      assertAllowedDatabaseUrl("postgresql://kbos:secret@kbos-pg18:5432/kbos")
    ).not.toThrow();
    expect(() =>
      assertAllowedDatabaseUrl("postgresql://kbos:secret@127.0.0.1:5432/kbos")
    ).not.toThrow();
  });

  it("valida payloads do scripts/recover-luana-prod.mjs contra os schemas Zod de producao", () => {
    const contactUuid = "7087dec6-00c1-46fc-90da-9284da12558c";
    const cParsed = contactCreateSchema.safeParse(buildContactPayload());
    expect(cParsed.success).toBe(true);
    expect(cParsed.data?.status).toBe("lead");

    const b1Parsed = budgetCreateSchema.safeParse(buildBudget1Payload(contactUuid));
    expect(b1Parsed.success).toBe(true);
    expect(b1Parsed.data?.status).toBe("draft");
    expect(b1Parsed.data?.items[0].unitPrice).toBe(2500);

    const b2Parsed = budgetCreateSchema.safeParse(buildBudget2Payload(contactUuid));
    expect(b2Parsed.success).toBe(true);
    expect(b2Parsed.data?.status).toBe("draft");
    expect(b2Parsed.data?.items[0].unitPrice).toBe(9800);

    const tParsed = taskCreateSchema.safeParse(
      buildTaskPayload(
        contactUuid,
        { id: "c197fe08-4ecb-4e9d-8c35-73e9aa09bccc", code: "#14004" },
        { id: "d445623c-c1f7-47ff-9501-b74787fc8432", code: "#14005" }
      )
    );
    expect(tParsed.success).toBe(true);
    expect(tParsed.data?.priority).toBe("alta");
    expect(tParsed.data?.status).toBe("todo");
    expect(tParsed.data?.dueAt).toBe("2026-11-05T21:00:00.000Z");
    expect(tParsed.data?.contactId).toBe(contactUuid);
  });
});

