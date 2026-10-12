// Unitários da Fase 3 — campanhas (puros, sem I/O, client-safe).
import { describe, expect, it } from "vitest";
import {
  estimateDurationMs,
  formatDuration,
  mailable,
  renderTemplate,
  staggeredDelayMs,
  targetStatuses,
  templateVars,
} from "../campaigns";

describe("renderTemplate", () => {
  it("substitui {{name}} e variações com espaço/maiúsculas", () => {
    const c = { name: "Maria Silva", company: "Padaria", email: "m@x.com", phone: "+55" };
    expect(renderTemplate("Olá {{name}}!", c)).toBe("Olá Maria Silva!");
    expect(renderTemplate("Oi {{ firstName }}, da {{COMPANY}}", c)).toBe("Oi Maria, da Padaria");
  });
  it("campos ausentes viram string vazia; desconhecidas preservadas", () => {
    expect(renderTemplate("{{name}} {{company}}", { name: "A" })).toBe("A ");
    expect(renderTemplate("{{typo}}", { name: "A" })).toBe("{{typo}}");
  });
});

describe("templateVars", () => {
  it("lista chaves únicas em minúsculas", () => {
    expect(templateVars("{{name}} e {{ firstName }} e {{name}}")).toEqual(["name", "firstname"]);
    expect(templateVars("sem vars")).toEqual([]);
  });
});

describe("targetStatuses", () => {
  it("all exclui arquivados (opt-out)", () => {
    expect(targetStatuses("all")).toEqual(["lead", "client", "partner"]);
  });
  it("direto por status; desconhecido cai no padrão", () => {
    expect(targetStatuses("client")).toEqual(["client"]);
    expect(targetStatuses("banana")).toEqual(["lead", "client", "partner"]);
  });
});

describe("mailable", () => {
  it("exige ≥10 dígitos", () => {
    expect(mailable("+55 (11) 99999-8888")).toBe(true);
    expect(mailable("11999998888")).toBe(true);
    expect(mailable("1234")).toBe(false);
    expect(mailable(null)).toBe(false);
  });
});

describe("staggeredDelayMs", () => {
  it("escalona por índice + jitter limitado (rand injetado)", () => {
    expect(staggeredDelayMs(0, 8000, () => 0)).toBe(0);
    expect(staggeredDelayMs(2, 8000, () => 0)).toBe(16000);
    expect(staggeredDelayMs(1, 8000, () => 0.5)).toBe(8000 + 2000);
    expect(staggeredDelayMs(1, 8000, () => 0.999)).toBeLessThan(8000 + 4000 + 8000);
  });
});

describe("estimateDurationMs / formatDuration", () => {
  it("estima total e formata pt-BR", () => {
    expect(estimateDurationMs(0, 8000)).toBe(0);
    expect(estimateDurationMs(1, 8000)).toBe(4000);
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(180_000)).toBe("3min");
    expect(formatDuration(3_700_000)).toBe("1h 1min");
  });
});
