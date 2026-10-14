// PDF de orçamentos — @react-pdf/renderer, A4, identidade de estúdio.
//
// Estrutura espelhada no modelo profissional de referência
// (`public/ORÇAMENTO-AL-MARE.pdf`): faixa de marca com logo, bloco
// "Orçamento Para" + Budget + data, linha de PROJETO, tabela numerada
// (N | Serviço/Descrição | Qtd | Unid | Total), linha de Total, bloco
// Conta Favorecida, opções de pagamento calculadas (à vista −10%,
// 50/50, cartão), Prazo + Revisões, Validade, Termos e Condições
// numerados no espírito do original, e assinaturas.
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, renderToBuffer } from "@react-pdf/renderer";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BudgetItem } from "./schema";
import { calcBudgetWithDiscount, calcPaymentOptions, formatBRL } from "./budgets";
import { DEFAULT_PIX_INFO } from "./constants";

export type BudgetPdfData = {
  code: string;
  title: string;
  status: string;
  totalAmount: string | number;
  validUntil: Date | string | null;
  terms: string | null;
  bankInfo: string | null;
  items: BudgetItem[];
  createdAt: Date | string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactCompany: string | null;
  // Retrato do cliente + proposta (0008, opcionais p/ orçamentos antigos).
  clientName?: string | null;
  clientCompany?: string | null;
  eventDates?: string[] | null;
  discountType?: string | null;
  discountValue?: string | number | null;
  // Condições comerciais (0009, opcionais p/ orçamentos antigos).
  paymentCondition?: string | null;
  deliveryDeadline?: string | null;
  revisionsCount?: number | null;
};

const INK = "#0e0e14";
const NIGHT = "#0b0b1e";
const ACCENT = "#8b7cf6";
const ICE = "#9db8e8";
const MUTED = "#555";
const FAINT = "#999";
const PAPER = "#f4f4f6";
const LINE = "#e2e2e8";

/** Logo claro do estúdio (`public/logo-kayque.png`) em data URI para a faixa escura. */
let logoCache: string | null | undefined;
function brandLogo(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const p = join(process.cwd(), "public", "logo-kayque.png");
    logoCache = existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10.5, lineHeight: 1.55, color: INK, fontFamily: "Helvetica" },
  // Faixa de marca full-bleed (margens negativas = sangria até a borda).
  band: {
    backgroundColor: NIGHT,
    marginTop: -40,
    marginHorizontal: -40,
    paddingTop: 26,
    paddingBottom: 20,
    paddingHorizontal: 40,
  },
  bandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 176 },
  brandFallback: { fontSize: 19, fontFamily: "Helvetica-Bold", letterSpacing: 4, color: "#fff" },
  brandSub: { fontSize: 8, color: ICE, marginTop: 4, letterSpacing: 2.5 },
  docLabel: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#fff", letterSpacing: 5, textAlign: "right" },
  docCode: { fontSize: 10, color: "#b9b9d0", marginTop: 3, textAlign: "right" },
  docDate: { fontSize: 10, color: "#b9b9d0", marginTop: 1, textAlign: "right" },
  statusPill: {
    marginTop: 8,
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: ICE,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  statusText: { fontSize: 8, color: "#fff", letterSpacing: 2, textAlign: "right" },
  bandRule: { marginTop: 14, borderBottomWidth: 2, borderBottomColor: ACCENT },
  // Bloco "Orçamento Para" (espelho do modelo).
  forLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: MUTED, marginTop: 18 },
  forName: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  forLine: { fontSize: 9.5, color: MUTED, marginTop: 1 },
  projectLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: MUTED, marginTop: 14 },
  projectTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: MUTED, marginTop: 18, marginBottom: 6 },
  // Tabela numerada (N | Serviço | Qtd | Unid | Total).
  tableHead: {
    flexDirection: "row",
    backgroundColor: INK,
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    letterSpacing: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE, fontSize: 10 },
  rowAlt: { backgroundColor: "#f7f7f9" },
  colN: { width: "7%" },
  colService: { width: "42%" },
  colQty: { width: "9%", textAlign: "right" },
  colUnit: { width: "21%", textAlign: "right" },
  colTotal: { width: "21%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  itemName: { fontFamily: "Helvetica-Bold" },
  desc: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  // Linha de Total (espelho do modelo) + resumo do desconto.
  totalLine: { flexDirection: "row", justifyContent: "flex-end", alignItems: "baseline", gap: 12, marginTop: 10 },
  totalWord: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  totalBig: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  discountLine: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 2 },
  cashLine: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 1 },
  // Datas de execução.
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  dateBadge: { backgroundColor: NIGHT, paddingVertical: 4, paddingHorizontal: 10 },
  dateText: { fontSize: 9, color: "#fff" },
  // Conta favorecida (espelho do modelo).
  bankBox: { marginTop: 14, backgroundColor: PAPER, borderLeftWidth: 3, borderLeftColor: ACCENT, padding: 10 },
  bankLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: MUTED },
  bankValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 3 },
  bankLine: { fontSize: 9.5, marginTop: 1 },
  // Pagamento.
  payRow: { flexDirection: "row", gap: 8 },
  payCard: { flex: 1, borderWidth: 1, borderColor: LINE, padding: 10 },
  payCardHot: { flex: 1, backgroundColor: NIGHT, padding: 10 },
  payTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  payValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 4 },
  payHint: { fontSize: 8.5, marginTop: 2 },
  // Prazo / revisões / validade.
  trio: { flexDirection: "row", gap: 10, marginTop: 14 },
  trioCard: { flex: 1, backgroundColor: PAPER, padding: 10 },
  trioLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", letterSpacing: 1.5, color: MUTED },
  trioValue: { fontSize: 10.5, marginTop: 3 },
  sectionText: { fontSize: 10, textAlign: "justify" },
  sign: { marginTop: 46, flexDirection: "row", justifyContent: "space-between" },
  signBox: { width: "45%", borderTopWidth: 1, borderTopColor: INK, paddingTop: 6, fontSize: 9, textAlign: "center" },
  rodape: { marginTop: 22, fontSize: 8, color: FAINT, textAlign: "center" },
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  completed: "Concluído",
  cancelled: "Cancelado",
  rejected: "Recusado",
};

const PAY_LABEL: Record<string, string> = {
  cash: "À vista",
  installments: "Parcelado",
  card: "Cartão",
};

const fmtDate = (v: Date | string | null | undefined): string => {
  if (!v) return "—";
  // Datas de execução vêm como `yyyy-mm-dd`: formata sem fuso (evita o
  // clássico off-by-one do `new Date("2026-01-01")` em UTC−X).
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export function BudgetPdf({ data }: { data: BudgetPdfData }) {
  const items = data.items || [];
  const clientName = data.contactName || data.clientName || "—";
  const clientCompany = data.contactCompany || data.clientCompany;
  const eventDates = (data.eventDates || []).filter(Boolean);
  const { subtotal, discountAmount, total } = calcBudgetWithDiscount(
    items,
    data.discountType,
    data.discountValue
  );
  const pay = calcPaymentOptions(total);
  const bankLines = (data.bankInfo?.trim() || DEFAULT_PIX_INFO).split("\n").map((l) => l.trim()).filter(Boolean);
  const logo = brandLogo();
  const isPay = (id: string) => (data.paymentCondition || "") === id;
  const revisions =
    data.revisionsCount == null
      ? null
      : data.revisionsCount === 1
        ? "1 revisão inclusa"
        : `${data.revisionsCount} revisões inclusas`;
  const payCard = (id: "cash" | "installments" | "card") => (isPay(id) ? s.payCardHot : s.payCard);
  const payInk = (id: string) => (isPay(id) ? "#fff" : INK);
  const paySub = (id: string) => (isPay(id) ? "#b9b9d0" : MUTED);
  return (
    <Document title={`Orçamento ${data.code} — Kayque Brito`}>
      <Page size="A4" style={s.page}>
        {/* ── Faixa de estúdio ─────────────────────────── */}
        <View style={s.band}>
          <View style={s.bandRow}>
            <View>
              {logo ? (
                <PdfImage src={logo} style={s.logo} />
              ) : (
                <Text style={s.brandFallback}>KAYQUE BRITO</Text>
              )}
              <Text style={s.brandSub}>STUDIO CRIATIVO — FOTO · VÍDEO · WEB</Text>
            </View>
            <View>
              <Text style={s.docLabel}>ORÇAMENTO</Text>
              <Text style={s.docCode}>Budget: {data.code}</Text>
              <Text style={s.docDate}>{fmtDate(data.createdAt)}</Text>
              <View style={s.statusPill}>
                <Text style={s.statusText}>{(STATUS_LABEL[data.status] ?? data.status).toUpperCase()}</Text>
              </View>
            </View>
          </View>
          <View style={s.bandRule} />
        </View>

        {/* ── Orçamento Para (modelo) ──────────────────── */}
        <Text style={s.forLabel}>ORÇAMENTO PARA:</Text>
        <Text style={s.forName}>
          {clientName}
          {clientCompany ? ` — ${clientCompany}` : ""}
        </Text>
        {data.contactEmail ? <Text style={s.forLine}>{data.contactEmail}</Text> : null}
        {data.contactPhone ? <Text style={s.forLine}>{data.contactPhone}</Text> : null}

        {/* ── Projeto ──────────────────────────────────── */}
        <Text style={s.projectLabel}>PROJETO</Text>
        <Text style={s.projectTitle}>{data.title}</Text>
        {data.paymentCondition ? (
          <Text style={s.forLine}>
            Pagamento preferido: {PAY_LABEL[data.paymentCondition] ?? data.paymentCondition}
          </Text>
        ) : null}

        {/* ── Datas de execução ────────────────────────── */}
        {eventDates.length ? (
          <View>
            <Text style={s.sectionTitle}>DATAS DE EXECUÇÃO</Text>
            <View style={s.dateRow}>
              {eventDates.map((d, i) => (
                <View key={`${d}-${i}`} style={s.dateBadge}>
                  <Text style={s.dateText}>{fmtDate(d)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Itens numerados (modelo) ─────────────────── */}
        <Text style={s.sectionTitle}>SERVIÇOS</Text>
        <View style={s.tableHead}>
          <Text style={s.colN}>N</Text>
          <Text style={s.colService}>SERVIÇO / DESCRIÇÃO</Text>
          <Text style={s.colQty}>QTD</Text>
          <Text style={s.colUnit}>UNID</Text>
          <Text style={s.colTotal}>TOTAL</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={i % 2 === 1 ? [s.tableRow, s.rowAlt] : s.tableRow} wrap={false}>
            <Text style={s.colN}>{i + 1}</Text>
            <View style={s.colService}>
              <Text style={s.itemName}>{it.service}</Text>
              {it.description ? <Text style={s.desc}>{it.description}</Text> : null}
            </View>
            <Text style={s.colQty}>{it.quantity}</Text>
            <Text style={s.colUnit}>{formatBRL(it.unitPrice)}</Text>
            <Text style={s.colTotal}>{formatBRL(it.total)}</Text>
          </View>
        ))}

        {/* ── Total (modelo) ───────────────────────────── */}
        <View style={s.totalLine}>
          <Text style={s.totalWord}>Total</Text>
          <Text style={s.totalBig}>{formatBRL(total)}</Text>
        </View>
        {discountAmount > 0 ? (
          <Text style={s.discountLine}>
            Subtotal {formatBRL(subtotal)} − desconto de {formatBRL(discountAmount)}
            {data.discountType === "percent" && Number(data.discountValue) > 0 ? ` (${Number(data.discountValue)}%)` : ""}
          </Text>
        ) : null}
        <Text style={s.cashLine}>
          À vista com 10% off: {formatBRL(pay.cash)} (economia de {formatBRL(pay.cashSavings)})
        </Text>

        {/* ── Conta favorecida (modelo) ────────────────── */}
        <View style={s.bankBox}>
          <Text style={s.bankLabel}>CONTA FAVORECIDA</Text>
          {bankLines.map((l, i) => (
            <Text key={i} style={i === 0 ? s.bankValue : s.bankLine}>{l}</Text>
          ))}
        </View>

        {/* ── Pagamento ────────────────────────────────── */}
        <Text style={s.sectionTitle}>OPÇÕES DE PAGAMENTO</Text>
        <View style={s.payRow}>
          <View style={payCard("cash")}>
            <Text style={[s.payTitle, { color: payInk("cash") }]}>A · À VISTA −10%</Text>
            <Text style={[s.payValue, { color: payInk("cash") }]}>{formatBRL(pay.cash)}</Text>
            <Text style={[s.payHint, { color: paySub("cash") }]}>Dinheiro ou Pix, economia de {formatBRL(pay.cashSavings)}</Text>
          </View>
          <View style={payCard("installments")}>
            <Text style={[s.payTitle, { color: payInk("installments") }]}>B · PARCELADO 50/50</Text>
            <Text style={[s.payValue, { color: payInk("installments") }]}>{formatBRL(total)}</Text>
            <Text style={[s.payHint, { color: paySub("installments") }]}>
              Entrada de {formatBRL(pay.entry)} + {formatBRL(pay.balance)} na entrega
            </Text>
          </View>
          <View style={payCard("card")}>
            <Text style={[s.payTitle, { color: payInk("card") }]}>C · CARTÃO</Text>
            <Text style={[s.payValue, { color: payInk("card") }]}>{formatBRL(pay.card)}</Text>
            <Text style={[s.payHint, { color: paySub("card") }]}>Crédito ou débito, valor integral</Text>
          </View>
        </View>

        {/* ── Prazo + revisões + validade ──────────────── */}
        {data.deliveryDeadline || revisions || data.validUntil ? (
          <View style={s.trio}>
            <View style={s.trioCard}>
              <Text style={s.trioLabel}>PRAZO DE ENTREGA</Text>
              <Text style={s.trioValue}>{data.deliveryDeadline || "—"}</Text>
            </View>
            <View style={s.trioCard}>
              <Text style={s.trioLabel}>REVISÕES INCLUSAS</Text>
              <Text style={s.trioValue}>{revisions || "—"}</Text>
            </View>
            <View style={s.trioCard}>
              <Text style={s.trioLabel}>VALIDADE</Text>
              <Text style={s.trioValue}>
                {data.validUntil ? `Válido até ${fmtDate(data.validUntil)}` : "—"}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Termos e condições (modelo) ──────────────── */}
        {data.terms ? (
          <View>
            <Text style={s.sectionTitle}>TERMOS E CONDIÇÕES</Text>
            <Text style={s.sectionText}>{data.terms}</Text>
          </View>
        ) : null}

        <View style={s.sign}>
          <Text style={s.signBox}>Kayque Brito — Contratado</Text>
          <Text style={s.signBox}>{clientName === "—" ? "Cliente" : clientName} — Contratante</Text>
        </View>
        <Text style={s.rodape}>
          Orçamento {data.code} · Studio Kayque Brito · kayquebrito.com.br
        </Text>
      </Page>
    </Document>
  );
}

/** Renderiza o PDF em Buffer (usado pela rota `/api/budgets/[id]/pdf`). */
export async function renderBudgetPdf(data: BudgetPdfData): Promise<Buffer> {
  const { createElement } = await import("react");
  return renderToBuffer(createElement(BudgetPdf, { data }) as never);
}
