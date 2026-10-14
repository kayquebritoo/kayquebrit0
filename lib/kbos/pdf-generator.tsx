// PDF de orçamentos — @react-pdf/renderer, A4, dark theme integral.
//
// Identidade do ecossistema: fundo `#0B0B1E` em todas as páginas, tinta
// `#F4F1EC`, gelo `#9DB8E8`, tipografia display Cottorway Pro (a mesma do
// site) + Helvetica no corpo. Estrutura em grid: cabeçalho (logo discreta
// à esquerda, ID/data/status à direita), cards Cliente/Projeto, badges de
// datas, tabela limpa, totalizador, 3 cards de pagamento, Pix em destaque,
// trio Prazo/Revisões/Validade, termos e assinaturas.
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, Font, renderToBuffer } from "@react-pdf/renderer";
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

// Tipografia display do site (Cottorway Pro .woff — mesma família do
// `app/globals.css`). Corpo segue em Helvetica (limpa e legível).
const DISPLAY = "Cottorway Pro";
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  try {
    const light = join(process.cwd(), "public", "fonts", "CottorwayPro-Light.woff");
    const bold = join(process.cwd(), "public", "fonts", "CottorwayPro-Bold.woff");
    if (existsSync(light) && existsSync(bold)) {
      Font.register({
        family: DISPLAY,
        fonts: [
          { src: light, fontWeight: 300 },
          { src: bold, fontWeight: 700 },
        ],
      });
      fontsRegistered = true;
    }
  } catch {
    /* sem display: cai para Helvetica-Bold */
  }
}
/** Logo do estúdio sem o selo "WEB DEVELOPER" (`public/logo-kayque-pdf.png`,
 *  derivada da original com o badge apagado) em data URI para o PDF escuro. */
let logoCache: string | null | undefined;
function brandLogo(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    const p = join(process.cwd(), "public", "logo-kayque-pdf.png");
    logoCache = existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : null;
  } catch {
    logoCache = null;
  }
  return logoCache;
}

const BG = "#0b0b1e";
const INK = "#ffffff";
const ICE = "#9dbbe8";
const SOFT = "rgba(255,255,255,0.66)";
const FAINT = "rgba(255,255,255,0.42)";
const CARD = "rgba(255,255,255,0.03)";
const HAIR = "rgba(255,255,255,0.12)";

const s = StyleSheet.create({
  page: { backgroundColor: BG, color: INK, padding: 44, fontSize: 10, lineHeight: 1.5, fontFamily: "Helvetica" },
  // Cabeçalho: logo discreta (34px) + bloco do documento.
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 34 },
  brandFallback: { fontSize: 15, letterSpacing: 3, color: INK, fontFamily: DISPLAY, fontWeight: 700 },
  docLabel: { fontSize: 7.5, letterSpacing: 3, color: FAINT, textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  docCode: { fontSize: 21, color: INK, marginTop: 1, textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  docMeta: { fontSize: 8.5, color: SOFT, marginTop: 2, textAlign: "right" },
  statusPill: {
    marginTop: 6,
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: ICE,
    paddingVertical: 2,
    paddingHorizontal: 9,
  },
  statusText: { fontSize: 7.5, color: ICE, letterSpacing: 2, textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  rule: { marginTop: 14, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: HAIR },
  // Cards Cliente / Projeto.
  grid: { flexDirection: "row", gap: 10, marginTop: 12 },
  card: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, padding: 11 },
  cardLabel: { fontSize: 7, letterSpacing: 2, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
  cardTitle: { fontSize: 11, color: INK, marginTop: 4, fontFamily: DISPLAY, fontWeight: 700 },
  cardText: { fontSize: 9, color: INK, marginTop: 4, fontFamily: DISPLAY, fontWeight: 700 },
  cardLine: { fontSize: 8.5, color: SOFT, marginTop: 1 },
  sectionTitle: { fontSize: 8, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 2, color: FAINT, marginTop: 16, marginBottom: 6 },
  // Datas: badges compactos com borda fina.
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dateBadge: { borderWidth: 1, borderColor: HAIR, paddingVertical: 3, paddingHorizontal: 9 },
  dateText: { fontSize: 8.5, color: ICE, fontFamily: DISPLAY, fontWeight: 700 },
  // Tabela limpa: cabeçalho discreto + filetes finos, sem preenchimento.
  tableHead: {
    flexDirection: "row",
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: FAINT,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: HAIR,
  },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", fontSize: 9.5 },
  colItem: { width: "46%" },
  colQty: { width: "10%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  colUnit: { width: "22%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  colTotal: { width: "22%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  itemName: { fontFamily: DISPLAY, fontWeight: 700, color: INK },
  desc: { fontSize: 8, color: SOFT, marginTop: 1 },
  // Totalizador à direita.
  totals: { marginTop: 10, alignItems: "flex-end" },
  totRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 1 },
  totLabel: { fontSize: 8.5, color: SOFT },
  totValue: { fontSize: 9.5, color: INK, width: 110, textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  grandLabel: { fontSize: 8, letterSpacing: 2, color: ICE, fontFamily: DISPLAY, fontWeight: 700 },
  grandValue: { fontSize: 22, color: INK, fontFamily: DISPLAY, fontWeight: 300 },
  cashNote: { fontSize: 8, color: SOFT, marginTop: 2 },
  // Pagamento: 3 cards com borda fina; preferida com borda gelo.
  payRow: { flexDirection: "row", gap: 8 },
  payCard: { flex: 1, borderWidth: 1, borderColor: HAIR, backgroundColor: CARD, padding: 9 },
  payCardHot: { flex: 1, borderWidth: 1, borderColor: ICE, backgroundColor: "rgba(157,184,232,0.07)", padding: 9 },
  payTitle: { fontSize: 7.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.2, color: SOFT },
  payTitleHot: { fontSize: 7.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.2, color: ICE },
  payValue: { fontSize: 12, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  payHint: { fontSize: 8, color: SOFT, marginTop: 1 },
  // Pix em destaque.
  pixBox: { marginTop: 8, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderLeftWidth: 3, borderLeftColor: ICE, padding: 9 },
  pixLabel: { fontSize: 7, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 2, color: FAINT },
  pixValue: { fontSize: 10.5, fontFamily: DISPLAY, fontWeight: 700, color: INK, marginTop: 3 },
  // Trio + termos + assinaturas.
  trio: { flexDirection: "row", gap: 10, marginTop: 12 },
  trioCard: { flex: 1, borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 7 },
  trioLabel: { fontSize: 7, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.8, color: FAINT },
  trioValue: { fontSize: 9.5, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  sectionText: { fontSize: 9.5, color: SOFT, textAlign: "justify" },
  sign: { marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  signBox: { width: "44%", borderTopWidth: 1, borderTopColor: SOFT, paddingTop: 6, fontSize: 8.5, color: SOFT, textAlign: "center", fontFamily: DISPLAY, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
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
  ensureFonts();
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
  const pix = data.bankInfo?.trim() || DEFAULT_PIX_INFO;
  const logo = brandLogo();
  const isPay = (id: string) => (data.paymentCondition || "") === id;
  const revisions =
    data.revisionsCount == null
      ? null
      : data.revisionsCount === 1
        ? "1 revisão inclusa"
        : `${data.revisionsCount} revisões inclusas`;
  return (
    <Document title={`Orçamento ${data.code} — Kayque Brito`}>
      <Page size="A4" style={s.page}>
        {/* ── Cabeçalho ────────────────────────────────── */}
        <View style={s.header}>
          <View>
            {logo ? (
              <PdfImage src={logo} style={s.logo} />
            ) : (
              <Text style={s.brandFallback}>KAYQUE BRITO</Text>
            )}
          </View>
          <View>
            <Text style={s.docLabel}>ORÇAMENTO</Text>
            <Text style={s.docCode}>{data.code}</Text>
            <Text style={s.docMeta}>Emitido em {fmtDate(data.createdAt)}</Text>
            <View style={s.statusPill}>
              <Text style={s.statusText}>{(STATUS_LABEL[data.status] ?? data.status).toUpperCase()}</Text>
            </View>
          </View>
        </View>
        <View style={s.rule} />

        {/* ── Cliente & Projeto ────────────────────────── */}
        <View style={s.grid}>
          <View style={s.card}>
            <Text style={s.cardLabel}>ORÇAMENTO PARA</Text>
            <Text style={s.cardTitle}>{clientName}</Text>
            {clientCompany ? <Text style={s.cardLine}>{clientCompany}</Text> : null}
            {data.contactEmail ? <Text style={s.cardLine}>{data.contactEmail}</Text> : null}
            {data.contactPhone ? <Text style={s.cardLine}>{data.contactPhone}</Text> : null}
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>PROJETO</Text>
            <Text style={s.cardText}>{data.title}</Text>
            <Text style={s.cardLine}>
              {items.length} item(ns)
              {data.paymentCondition ? ` · ${PAY_LABEL[data.paymentCondition] ?? data.paymentCondition}` : ""}
            </Text>
          </View>
        </View>

        {/* ── Datas de execução ────────────────────────── */}
        {eventDates.length ? (
          <View wrap={false}>
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

        {/* ── Itens ────────────────────────────────────── */}
        <Text style={s.sectionTitle}>SERVIÇOS</Text>
        <View style={s.tableHead}>
          <Text style={s.colItem}>ITEM</Text>
          <Text style={s.colQty}>QTD</Text>
          <Text style={s.colUnit}>VALOR UNIT.</Text>
          <Text style={s.colTotal}>SUBTOTAL</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <View style={s.colItem}>
              <Text style={s.itemName}>{it.service}</Text>
              {it.description ? <Text style={s.desc}>{it.description}</Text> : null}
            </View>
            <Text style={s.colQty}>{it.quantity}</Text>
            <Text style={s.colUnit}>{formatBRL(it.unitPrice)}</Text>
            <Text style={s.colTotal}>{formatBRL(it.total)}</Text>
          </View>
        ))}

        {/* ── Totalizador ──────────────────────────────── */}
        <View style={s.totals} wrap={false}>
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal</Text>
            <Text style={s.totValue}>{formatBRL(subtotal)}</Text>
          </View>
          {discountAmount > 0 ? (
            <View style={s.totRow}>
              <Text style={s.totLabel}>
                Desconto{data.discountType === "percent" && Number(data.discountValue) > 0 ? ` (${Number(data.discountValue)}%)` : ""}
              </Text>
              <Text style={s.totValue}>−{formatBRL(discountAmount)}</Text>
            </View>
          ) : null}
          <View style={[s.totRow, { marginTop: 5 }]}>
            <Text style={s.grandLabel}>TOTAL</Text>
            <Text style={s.grandValue}>{formatBRL(total)}</Text>
          </View>
          <Text style={s.cashNote}>
            À vista com 10% off: {formatBRL(pay.cash)} · economia de {formatBRL(pay.cashSavings)}
          </Text>
        </View>

        {/* ── Pagamento ────────────────────────────────── */}
        <Text style={s.sectionTitle}>CONDIÇÕES DE PAGAMENTO</Text>
        <View wrap={false}>
          <View style={s.payRow}>
            <View style={isPay("cash") ? s.payCardHot : s.payCard}>
              <Text style={isPay("cash") ? s.payTitleHot : s.payTitle}>À VISTA −10% OFF</Text>
              <Text style={s.payValue}>{formatBRL(pay.cash)}</Text>
              <Text style={s.payHint}>Dinheiro ou Pix · economiza {formatBRL(pay.cashSavings)}</Text>
            </View>
            <View style={isPay("installments") ? s.payCardHot : s.payCard}>
              <Text style={isPay("installments") ? s.payTitleHot : s.payTitle}>PARCELADO 50/50</Text>
              <Text style={s.payValue}>{formatBRL(total)}</Text>
              <Text style={s.payHint}>{formatBRL(pay.entry)} entrada + {formatBRL(pay.balance)} na entrega</Text>
            </View>
            <View style={isPay("card") ? s.payCardHot : s.payCard}>
              <Text style={isPay("card") ? s.payTitleHot : s.payTitle}>CARTÃO</Text>
              <Text style={s.payValue}>{formatBRL(pay.card)}</Text>
              <Text style={s.payHint}>Crédito ou débito · valor integral</Text>
            </View>
          </View>
          <View style={s.pixBox}>
            <Text style={s.pixLabel}>CHAVE PIX</Text>
            <Text style={s.pixValue}>{pix}</Text>
          </View>
        </View>

        {/* ── Prazo / Revisões / Validade ──────────────── */}
        <View style={s.trio} wrap={false}>
          <View style={s.trioCard}>
            <Text style={s.trioLabel}>PRAZO DE ENTREGA</Text>
            <Text style={s.trioValue}>{data.deliveryDeadline || "A combinar"}</Text>
          </View>
          <View style={s.trioCard}>
            <Text style={s.trioLabel}>REVISÕES INCLUSAS</Text>
            <Text style={s.trioValue}>{revisions || "A combinar"}</Text>
          </View>
          <View style={s.trioCard}>
            <Text style={s.trioLabel}>VALIDADE</Text>
            <Text style={s.trioValue}>{data.validUntil ? `Até ${fmtDate(data.validUntil)}` : "A combinar"}</Text>
          </View>
        </View>

        {/* ── Termos ───────────────────────────────────── */}
        {data.terms ? (
          <View>
            <Text style={s.sectionTitle}>TERMOS E CONDIÇÕES</Text>
            <Text style={s.sectionText}>{data.terms}</Text>
          </View>
        ) : null}

        {/* ── Assinaturas ──────────────────────────────── */}
        <View style={s.sign} wrap={false}>
          <Text style={s.signBox}>Kayque Brito — Contratado</Text>
          <Text style={s.signBox}>{clientName === "—" ? "Cliente" : clientName} — Contratante</Text>
        </View>

        {/* ── Rodapé (todas as páginas) ────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Orçamento {data.code} · Studio Kayque Brito</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `kayquebrito.com.br · ${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Renderiza o PDF em Buffer (usado pela rota `/api/budgets/[id]/pdf`). */
export async function renderBudgetPdf(data: BudgetPdfData): Promise<Buffer> {
  const { createElement } = await import("react");
  return renderToBuffer(createElement(BudgetPdf, { data }) as never);
}
