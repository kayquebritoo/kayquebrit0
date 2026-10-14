// Smoke test do PDF de orçamentos: renderiza com dados no formato do
// modelo de referência (`public/ORÇAMENTO-AL-MARE.pdf`) e garante buffer válido.
import { describe, expect, it } from "vitest";
import { renderBudgetPdf } from "../pdf-generator";

describe("renderBudgetPdf", () => {
  it("gera o PDF estilo Al Mare sem quebrar", async () => {
    const buf = await renderBudgetPdf({
      code: "#14001",
      title: "Almare 360º — Reestruturação digital e comercial",
      status: "sent",
      totalAmount: "10000",
      validUntil: "2026-09-24",
      terms: "1- O pagamento pode ser parcelado em até 4x\n2- Prazo de entrega total é de 4 meses",
      bankInfo: "Kayque Jonathan Brito\nPICPAY\n(91) 99374-3109",
      items: [
        { service: "Id Visual", description: "Nova identidade completa para reposicionar o hostel no mercado.", quantity: 1, unitPrice: 1500, total: 1500, date: "2026-10-01" },
        { service: "Posicionamento", description: "Otimização total do Google Meu Negócio.", quantity: 1, unitPrice: 1500, total: 1500, date: "2026-10-02" },
        { service: "Produção Audiovisual", description: "Fotos profissionais e vídeos dinâmicos para Booking, OTAs e redes sociais.", quantity: 1, unitPrice: 1500, total: 1500, date: "2026-10-03" },
        { service: "Canais de Vendas Site+PMS", description: "Site moderno focado em conversão mobile + motor de reservas integrado.", quantity: 1, unitPrice: 3000, total: 3000, date: "2026-10-04" },
        { service: "OTA'S", description: "Reestruturação dos perfis no Booking.com e Airbnb.", quantity: 1, unitPrice: 1000, total: 1000 },
        { service: "Google+Meta", description: "Configuração das contas de anúncios + mentoria prática.", quantity: 1, unitPrice: 3000, total: 3000 },
      ],
      createdAt: "2026-09-10",
      contactName: "AlMare Hostel — R. Rodolfo Milanez",
      contactEmail: null,
      contactPhone: null,
      contactCompany: "Al Mare Hostel",
      clientName: null,
      clientCompany: null,
      eventDates: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
      discountType: null,
      discountValue: null,
      paymentCondition: "installments",
      deliveryDeadline: "4 meses",
      revisionsCount: 2,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);
});
