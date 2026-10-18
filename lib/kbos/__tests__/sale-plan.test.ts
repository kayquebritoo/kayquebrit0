import { describe, expect, it } from "vitest";
import { localDay, paymentSchedule, reminderOffset, saleAcceptanceSchema, salePlanSchema, type SalePlan } from "../sale-plan";
const plan: SalePlan = { service: "site", startDate: "2026-10-18", deliveryDate: "2026-11-18", months: 1, manualUrl: "https://example.com/manual" };
describe("venda conectada", () => {
  it("exige nome e os dois aceites expressos", () => {
    expect(saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: true, manualAccepted: true }).success).toBe(true);
    expect(saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: true, manualAccepted: false }).success).toBe(false);
    expect(saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: "true", manualAccepted: true }).success).toBe(false);
    expect(saleAcceptanceSchema.safeParse({ signerName: "  ", contractAccepted: true, manualAccepted: true }).success).toBe(false);
  });
  it("divide centavos sem perder valor e aplica o desconto escolhido", () => {
    expect(paymentSchedule(100.01, "installments", plan).map((i) => i.amount)).toEqual([50.01, 50]);
    expect(paymentSchedule(100, "cash", plan)[0].amount).toBe(90);
    expect(paymentSchedule(100, "card", plan)[0].amount).toBe(100);
    expect(() => paymentSchedule(100, null, plan)).toThrow();
  });
  it("mensalidade é pré-paga, sem desconto e sem 50/50, inclusive na virada do ano", () => {
    const p = { ...plan, service: "mensal" as const, startDate: "2026-12-31", deliveryDate: "2027-02-28", months: 3 };
    const schedule = paymentSchedule(100, "cash", p);
    expect(schedule.map((i) => i.amount)).toEqual([100, 100, 100]);
    expect(schedule.map((i) => i.dueDate)).toEqual(["2026-12-31", "2027-01-05", "2027-02-05"]);
    expect(schedule[0].onAcceptance).toBe(true);
  });
  it("rejeita datas impossíveis, vigência inconsistente e link sem HTTPS", () => {
    expect(salePlanSchema.safeParse({ ...plan, startDate: "2026-02-30" }).success).toBe(false);
    expect(salePlanSchema.safeParse({ ...plan, deliveryDate: "2026-10-01" }).success).toBe(false);
    expect(salePlanSchema.safeParse({ ...plan, service: "mensal", months: 5 }).success).toBe(false);
    expect(salePlanSchema.safeParse({ ...plan, manualUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("calcula lembrete pelo dia de Belém, mesmo após meia-noite UTC", () => {
    const now = new Date("2026-10-19T02:30:00Z");
    expect(localDay(now)).toBe("2026-10-18");
    expect(reminderOffset("2026-10-20", now)).toBe(2);
    expect(reminderOffset("2026-10-18", now)).toBe(0);
    expect(reminderOffset("2026-10-19", now)).toBeNull();
  });
});
