// Unitários da Fase 4 — agenda e alertas (puros, sem I/O).
import { describe, expect, it } from "vitest";
import { dueReminders, isReminderDue, reminderLabel, reminderMessage } from "../agenda";

const MIN = 60_000;
const now = new Date("2026-10-11T12:00:00Z");
const ev = (over: Record<string, unknown> = {}) => ({
  title: "Reunião",
  startTime: new Date(now.getTime() + 10 * MIN).toISOString(),
  reminderMinutesBefore: 15,
  notificationSent: false,
  ...over,
});

describe("isReminderDue", () => {
  it("devido dentro da antecedência (10 min p/ evento, aviso 15)", () => {
    expect(isReminderDue(ev(), now)).toBe(true);
  });
  it("cedo demais não dispara", () => {
    expect(isReminderDue(ev({ startTime: new Date(now.getTime() + 60 * MIN).toISOString() }), now)).toBe(false);
  });
  it("já enviado, sem aviso (0) ou inválido não disparam", () => {
    expect(isReminderDue(ev({ notificationSent: true }), now)).toBe(false);
    expect(isReminderDue(ev({ reminderMinutesBefore: 0 }), now)).toBe(false);
    expect(isReminderDue(ev({ startTime: "invalida" }), now)).toBe(false);
  });
  it("catchup cobre evento recém-iniciado; fora dele, não", () => {
    const started = ev({ startTime: new Date(now.getTime() - 30 * MIN).toISOString() });
    expect(isReminderDue(started, now, 60)).toBe(true);
    expect(isReminderDue(started, now, 10)).toBe(false);
  });
});

describe("dueReminders", () => {
  it("filtra e ordena por início", () => {
    const late = ev({ title: "B", startTime: new Date(now.getTime() + 14 * MIN).toISOString() });
    const early = ev({ title: "A", startTime: new Date(now.getTime() + 5 * MIN).toISOString() });
    const far = ev({ title: "C", startTime: new Date(now.getTime() + 90 * MIN).toISOString() });
    expect(dueReminders([late, far, early], now).map((e) => e.title)).toEqual(["A", "B"]);
  });
});

describe("reminderMessage / reminderLabel", () => {
  it("mensagem pt-BR com título, hora e local", () => {
    const m = reminderMessage({ ...ev(), location: "Meet" });
    expect(m).toContain("KBOS — lembrete");
    expect(m).toContain("Reunião");
    expect(m).toContain("Meet");
    expect(m).toContain("15 min");
  });
  it("selo da UI", () => {
    expect(reminderLabel(15)).toBe("Aviso via WhatsApp 15 min antes");
    expect(reminderLabel(0)).toBe("Sem aviso");
    expect(reminderLabel(null)).toBe("Aviso via WhatsApp 15 min antes");
  });
});
