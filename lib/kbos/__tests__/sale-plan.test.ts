import { describe, expect, it } from "vitest";
import {
  buildInterestFreeOptions,
  calcProviderFeeBreakdown,
  inferServiceAndSubtype,
  installmentsTotal,
  localDay,
  paymentSchedule,
  planEndDate,
  reminderOffset,
  saleAcceptanceSchema,
  salePlanSchema,
  splitExactInstallments,
  type SalePlan,
} from "../sale-plan";

const plan: SalePlan = {
  service: "site",
  startDate: "2026-10-18",
  deliveryDate: "2026-11-18",
  months: 1,
  manualUrl: "https://example.com/manual",
};

describe("venda conectada", () => {
  it("calcula cinco meses de 01/11 a 01/04 sem exigir duas datas", () => {
    expect(planEndDate("2026-11-01", 5)).toBe("2027-04-01");
    expect(
      salePlanSchema.safeParse({
        ...plan,
        service: "mensal",
        startDate: "2026-11-01",
        deliveryDate: "2027-04-01",
        months: 5,
      }).success,
    ).toBe(true);
    expect(planEndDate("2027-01-31", 1)).toBe("2027-02-28");
    expect(planEndDate("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("aceita manual enviado, referências externas ou nenhum material (manual opcional)", () => {
    const attachments = [
      { kind: "file", fileId: "d7a758ad-783b-442d-b477-81bdbbf0e362", name: "manual.pdf", role: "manual" },
      { kind: "link", url: "https://example.com/referencia", name: "Referência", role: "reference" },
    ];
    expect(salePlanSchema.safeParse({ ...plan, manualUrl: "", attachments }).success).toBe(true);
    expect(salePlanSchema.safeParse({ ...plan, manualUrl: "", attachments: [] }).success).toBe(true);
    expect(
      salePlanSchema.safeParse({
        ...plan,
        manualUrl: "",
        attachments: attachments.map((a) => ({ ...a, role: "reference" })),
      }).success,
    ).toBe(true);
  });

  it("exige nome e os dois aceites expressos", () => {
    expect(
      saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: true, manualAccepted: true }).success,
    ).toBe(true);
    expect(
      saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: true, manualAccepted: false }).success,
    ).toBe(false);
    expect(
      saleAcceptanceSchema.safeParse({ signerName: "Cliente", contractAccepted: "true", manualAccepted: true }).success,
    ).toBe(false);
    expect(
      saleAcceptanceSchema.safeParse({ signerName: "  ", contractAccepted: true, manualAccepted: true }).success,
    ).toBe(false);
  });

  it("divide centavos sem perder valor e aplica desconto à vista apenas quando explícito", () => {
    expect(paymentSchedule(100.01, "installments", plan).map((i) => i.amount)).toEqual([50.01, 50]);
    expect(paymentSchedule(100, "cash", plan)[0].amount).toBe(100);
    expect(paymentSchedule(100, "cash", { ...plan, applyCashDiscount: true })[0].amount).toBe(90);
    expect(paymentSchedule(100, "card", plan)[0].amount).toBe(100);
    expect(() => paymentSchedule(100, null, plan)).toThrow();
  });

  it("suporta os 4 cenários de parcelamento sem juros (1x, 2x, 3x e 4x) das duas propostas de Luana Nakata / Sorella Import com soma exata em centavos", () => {
    // Proposta 1: Landing Page — R$ 2.500,00 (7 a 12 dias úteis), em 1x, 2x, 3x ou 4x sem juros e sem desconto automático
    const inferred1 = inferServiceAndSubtype({ title: "Landing Page — Sorella Import" });
    expect(inferred1).toEqual({ service: "site", subtype: "Landing Page" });

    const lpOptions = buildInterestFreeOptions(2500, "2026-11-05", "2026-11-20", 4);
    expect(lpOptions).toHaveLength(4);
    expect(lpOptions[0].installments.map((i) => i.amount)).toEqual([2500]);
    expect(lpOptions[1].installments.map((i) => i.amount)).toEqual([1250, 1250]);
    expect(lpOptions[2].installments.map((i) => i.amount)).toEqual([833.34, 833.33, 833.33]);
    expect(lpOptions[3].installments.map((i) => i.amount)).toEqual([625, 625, 625, 625]);
    for (const opt of lpOptions) {
      expect(installmentsTotal(opt.installments)).toBe(2500);
      expect(opt.total).toBe(2500);
    }

    // Proposta 2: E-commerce e Gestão — R$ 9.800,00 (45 a 60 dias), em 1x, 2x, 3x ou 4x sem juros e sem desconto automático
    const inferred2 = inferServiceAndSubtype({ title: "E-commerce e Gestão — Sorella Import" });
    expect(inferred2).toEqual({ service: "site", subtype: "E-commerce e Gestão" });

    const ecomOptions = buildInterestFreeOptions(9800, "2026-11-05", "2026-12-30", 4);
    expect(ecomOptions).toHaveLength(4);
    expect(ecomOptions[0].installments.map((i) => i.amount)).toEqual([9800]);
    expect(ecomOptions[1].installments.map((i) => i.amount)).toEqual([4900, 4900]);
    expect(ecomOptions[2].installments.map((i) => i.amount)).toEqual([3266.68, 3266.66, 3266.66]);
    expect(ecomOptions[3].installments.map((i) => i.amount)).toEqual([2450, 2450, 2450, 2450]);
    for (const opt of ecomOptions) {
      expect(installmentsTotal(opt.installments)).toBe(9800);
      expect(opt.total).toBe(9800);
    }

    // Garante que paymentSchedule aceita 1, 2, 3 e 4 parcelas na emissão e nunca perde centavos
    for (const count of [1, 2, 3, 4] as const) {
      const s1 = paymentSchedule(2500, count === 1 ? "cash" : "installments", {
        ...plan,
        subtype: "Landing Page",
        installmentsCount: count,
        applyCashDiscount: false,
      });
      expect(s1).toHaveLength(count);
      expect(installmentsTotal(s1)).toBe(2500);

      const s2 = paymentSchedule(9800, count === 1 ? "cash" : "installments", {
        ...plan,
        subtype: "E-commerce e Gestão",
        installmentsCount: count,
        applyCashDiscount: false,
      });
      expect(s2).toHaveLength(count);
      expect(installmentsTotal(s2)).toBe(9800);
    }
  });

  it("aplica a tabela de descontos progressivos via PIX (1x 10%, 2x 6%, 3x 3%, 4x 0%) nas duas propostas da Luana Nakata sem acumular descontos e com divisão exata em centavos", () => {
    // Proposta 1: Landing Page (base R$ 2.500,00)
    // 1x (-10%) = R$ 2.250,00 | 2x (-6%) = R$ 2.350,00 | 3x (-3%) = R$ 2.425,00 | 4x (0%) = R$ 2.500,00
    const lpProg = buildInterestFreeOptions(2500, "2026-11-05", "2026-11-20", 4, true);
    expect(lpProg).toHaveLength(4);
    expect(lpProg.map((o) => ({
      count: o.count,
      discountPercent: o.discountPercent,
      discountAmount: o.discountAmount,
      total: o.total,
      amounts: o.installments.map((i) => i.amount),
    }))).toEqual([
      { count: 1, discountPercent: 10, discountAmount: 250, total: 2250, amounts: [2250] },
      { count: 2, discountPercent: 6, discountAmount: 150, total: 2350, amounts: [1175, 1175] },
      { count: 3, discountPercent: 3, discountAmount: 75, total: 2425, amounts: [808.34, 808.33, 808.33] },
      { count: 4, discountPercent: 0, discountAmount: 0, total: 2500, amounts: [625, 625, 625, 625] },
    ]);
    for (const opt of lpProg) {
      expect(installmentsTotal(opt.installments)).toBe(opt.total);
      expect(opt.baseTotal).toBe(2500);
    }

    // Proposta 2: E-commerce e Gestão (base R$ 9.800,00)
    // 1x (-10%) = R$ 8.820,00 | 2x (-6%) = R$ 9.212,00 | 3x (-3%) = R$ 9.506,00 | 4x (0%) = R$ 9.800,00
    const ecomProg = buildInterestFreeOptions(9800, "2026-11-05", "2026-12-30", 4, true);
    expect(ecomProg).toHaveLength(4);
    expect(ecomProg.map((o) => ({
      count: o.count,
      discountPercent: o.discountPercent,
      discountAmount: o.discountAmount,
      total: o.total,
      amounts: o.installments.map((i) => i.amount),
    }))).toEqual([
      { count: 1, discountPercent: 10, discountAmount: 980, total: 8820, amounts: [8820] },
      { count: 2, discountPercent: 6, discountAmount: 588, total: 9212, amounts: [4606, 4606] },
      { count: 3, discountPercent: 3, discountAmount: 294, total: 9506, amounts: [3168.68, 3168.66, 3168.66] },
      { count: 4, discountPercent: 0, discountAmount: 0, total: 9800, amounts: [2450, 2450, 2450, 2450] },
    ]);
    for (const opt of ecomProg) {
      expect(installmentsTotal(opt.installments)).toBe(opt.total);
      expect(opt.baseTotal).toBe(9800);
    }

    // Garante que applyCashDiscount = true combinado com progressiveDiscounts = true NÃO aplica desconto duas vezes
    const noDouble = paymentSchedule(2500, "cash", {
      ...plan,
      installmentsCount: 1,
      progressiveDiscounts: true,
      applyCashDiscount: true,
    });
    expect(installmentsTotal(noDouble)).toBe(2250);
  });

  it("distingue o valor cobrado à cliente (sem juros) do custo assumido pelo vendedor no meio de pagamento", () => {
    // Pix / transferência direta em 4x: taxa 0%, cliente paga R$ 2.500,00 e vendedor recebe R$ 2.500,00
    const pix4x = calcProviderFeeBreakdown(2500, 4, "installments");
    expect(pix4x.supportsUpTo4xInterestFree).toBe(true);
    expect(pix4x.clientChargedTotal).toBe(2500);
    expect(pix4x.clientInstallments).toEqual([625, 625, 625, 625]);
    expect(pix4x.providerFeePercent).toBe(0);
    expect(pix4x.sellerAbsorbedCost).toBe(0);
    expect(pix4x.sellerNetReceived).toBe(2500);

    // Cartão / gateway em 4x sem juros para a cliente: cliente continua pagando exatamente R$ 9.800,00 (4x R$ 2.450,00),
    // enquanto a taxa do provedor é isolada como custo assumido pelo vendedor
    const card4x = calcProviderFeeBreakdown(9800, 4, "card");
    expect(card4x.supportsUpTo4xInterestFree).toBe(true);
    expect(card4x.clientChargedTotal).toBe(9800);
    expect(card4x.clientInstallments).toEqual([2450, 2450, 2450, 2450]);
    expect(card4x.providerFeePercent).toBeGreaterThan(0);
    expect(card4x.sellerAbsorbedCost).toBe(Math.round(9800 * (card4x.providerFeePercent / 100) * 100) / 100);
    expect(card4x.sellerNetReceived).toBe(Math.round((9800 - card4x.sellerAbsorbedCost) * 100) / 100);
    expect(splitExactInstallments(100, 3)).toEqual([33.34, 33.33, 33.33]);
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

