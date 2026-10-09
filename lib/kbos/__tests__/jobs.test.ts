// Unitários da fila KBOS — sem Redis, sem banco (puros e determinísticos).
import { describe, expect, it } from "vitest";
import {
  JOB_MAX_DELAY_MS,
  buildIdempotencyKey,
  calcBackoffDelay,
  stableStringify,
} from "../jobs";
import { isOverdue, isStaleBriefing } from "../job-handlers";

describe("stableStringify", () => {
  it("ordena chaves (mesma carga = mesma string)", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it("é recursivo em objetos aninhados e arrays", () => {
    expect(stableStringify({ z: [{ b: 1, a: 0 }], a: null })).toBe(
      '{"a":null,"z":[{"a":0,"b":1}]}'
    );
  });
});

describe("buildIdempotencyKey", () => {
  it("é determinística", () => {
    const p = { destino: "5591", mensagem: "oi" };
    expect(buildIdempotencyKey("notify.whatsapp", p)).toBe(
      buildIdempotencyKey("notify.whatsapp", p)
    );
  });
  it("muda com tipo ou carga", () => {
    const p = { destino: "5591", mensagem: "oi" };
    expect(buildIdempotencyKey("notify.whatsapp", p)).not.toBe(
      buildIdempotencyKey("notify.whatsapp", { ...p, mensagem: "tchau" })
    );
    expect(buildIdempotencyKey("a", p)).not.toBe(buildIdempotencyKey("b", p));
  });
  it("tem prefixo seguro p/ o BullMQ (sem `:`)", () => {
    const k = buildIdempotencyKey("billing.reconcile", {});
    expect(k.startsWith("kbos-billing-reconcile-")).toBe(true);
    expect(k).not.toContain(":");
  });
});

describe("calcBackoffDelay", () => {
  it("dobra por tentativa: 5s, 10s, 20s", () => {
    expect(calcBackoffDelay(1, 5_000)).toBe(5_000);
    expect(calcBackoffDelay(2, 5_000)).toBe(10_000);
    expect(calcBackoffDelay(3, 5_000)).toBe(20_000);
  });
  it("respeita o teto de 1h", () => {
    expect(calcBackoffDelay(20, 5_000)).toBe(JOB_MAX_DELAY_MS);
    expect(calcBackoffDelay(1, 0)).toBe(0);
  });
});

describe("isOverdue", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  const future = new Date("2027-01-01T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");
  it("pendente + vencida = true", () => {
    expect(isOverdue({ status: "pendente", vencimento: past }, now)).toBe(true);
  });
  it("pendente + futura = false", () => {
    expect(isOverdue({ status: "pendente", vencimento: future }, now)).toBe(false);
  });
  it("paga + vencida = false; sem vencimento = false", () => {
    expect(isOverdue({ status: "pago", vencimento: past }, now)).toBe(false);
    expect(isOverdue({ status: "pendente", vencimento: null }, now)).toBe(false);
  });
});

describe("isStaleBriefing", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
  it("novo há 49h (limite 48h) = true", () => {
    expect(isStaleBriefing({ status: "novo", createdAt: h(49) }, now, 48)).toBe(true);
  });
  it("novo há 1h = false; em_analise há 100h = false", () => {
    expect(isStaleBriefing({ status: "novo", createdAt: h(1) }, now, 48)).toBe(false);
    expect(isStaleBriefing({ status: "em_analise", createdAt: h(100) }, now, 48)).toBe(false);
  });
});
