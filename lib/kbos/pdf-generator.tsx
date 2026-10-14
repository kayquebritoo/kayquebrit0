// PDF de orçamentos — @react-pdf/renderer, A4, identidade KBOS.
//
// Estrutura profissional: cabeçalho de marca, número do orçamento, bloco do
// cliente, tabela de serviços (serviço/qtd/unit/total), totalizador,
// validade, termos, dados bancários, assinatura e rodapé. Segue o mesmo
// padrão visual de `contract-pdf.tsx` (Helvetica, A4, cinza+preto).
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { BudgetItem } from "@/lib/kbos/schema";
import { calcBudgetWithDiscount, formatBRL } from "@/lib/kbos/budgets";

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
};

const BRAND = "#0e0e14";
const ACCENT = "#8b7cf6";
const MUTED = "#666";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10.5, lineHeight: 1.55, color: BRAND, fontFamily: "Helvetica" },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 3 },
  brandSub: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  rule: { marginTop: 10, marginBottom: 16, borderBottomWidth: 2, borderBottomColor: ACCENT },
  docTitle: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  docCode: { fontSize: 10, color: MUTED, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, marginBottom: 6 },
  metaBox: { width: "48%" },
  metaLabel: { fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  metaValue: { fontSize: 10.5, marginTop: 2 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: BRAND,
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingVertical: 7,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e5e5ea", fontSize: 10 },
  colService: { width: "46%" },
  colQty: { width: "12%", textAlign: "right" },
  colUnit: { width: "21%", textAlign: "right" },
  colTotal: { width: "21%", textAlign: "right" },
  desc: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  totalBox: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalInner: { width: "42%", backgroundColor: "#f2f2f5", padding: 10 },
  totalLabel: { fontSize: 9, color: MUTED, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  totalValue: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: MUTED, marginBottom: 4 },
  sectionText: { fontSize: 10, textAlign: "justify" },
  sign: { marginTop: 44, flexDirection: "row", justifyContent: "space-between" },
  signBox: { width: "45%", borderTopWidth: 1, borderTopColor: BRAND, paddingTop: 6, fontSize: 9, textAlign: "center" },
  rodape: { marginTop: 22, fontSize: 8, color: "#999", textAlign: "center" },
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  approved: "Aprovado",
  completed: "Concluído",
  cancelled: "Cancelado",
  rejected: "Recusado",
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
  const showDiscount = discountAmount > 0;
  return (
    <Document title={`Orçamento ${data.code} — Kayque Brito`}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>KAYQUE BRITO</Text>
        <Text style={s.brandSub}>STUDIO CRIATIVO — FOTO · VÍDEO · WEB</Text>
        <View style={s.rule} />
        <Text style={s.docTitle}>Orçamento {data.code}</Text>
        <Text style={s.docCode}>
          {data.title} · {STATUS_LABEL[data.status] ?? data.status} · emitido em {fmtDate(data.createdAt)}
        </Text>

        <View style={s.metaRow}>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>CLIENTE</Text>
            <Text style={s.metaValue}>{clientName}</Text>
            {clientCompany ? <Text style={s.metaValue}>{clientCompany}</Text> : null}
            {data.contactEmail ? <Text style={s.metaValue}>{data.contactEmail}</Text> : null}
            {data.contactPhone ? <Text style={s.metaValue}>{data.contactPhone}</Text> : null}
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>VALIDADE</Text>
            <Text style={s.metaValue}>Válido até {fmtDate(data.validUntil)}</Text>
            {eventDates.length ? (
              <Text style={s.metaValue}>
                {eventDates.length === 1 ? "Data de execução: " : "Datas de execução: "}
                {eventDates.map(fmtDate).join(" · ")}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={s.colService}>SERVIÇO</Text>
          <Text style={s.colQty}>QTD</Text>
          <Text style={s.colUnit}>VALOR UNIT.</Text>
          <Text style={s.colTotal}>TOTAL</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <View style={s.colService}>
              <Text>{it.service}</Text>
              {it.description ? <Text style={s.desc}>{it.description}</Text> : null}
            </View>
            <Text style={s.colQty}>{it.quantity}</Text>
            <Text style={s.colUnit}>{formatBRL(it.unitPrice)}</Text>
            <Text style={s.colTotal}>{formatBRL(it.total)}</Text>
          </View>
        ))}

        <View style={s.totalBox}>
          <View style={s.totalInner}>
            <Text style={s.totalLabel}>SUBTOTAL</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 }}>
              {formatBRL(subtotal)}
            </Text>
            {showDiscount ? (
              <Text style={{ fontSize: 10, marginTop: 4 }}>
                Desconto: −{formatBRL(discountAmount)}
                {data.discountType === "percent" && Number(data.discountValue) > 0
                  ? ` (${Number(data.discountValue)}%)`
                  : ""}
              </Text>
            ) : null}
            <Text style={{ ...s.totalLabel, marginTop: 6 }}>TOTAL DO ORÇAMENTO</Text>
            <Text style={s.totalValue}>{formatBRL(total)}</Text>
          </View>
        </View>

        {data.terms ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>TERMOS E CONDIÇÕES</Text>
            <Text style={s.sectionText}>{data.terms}</Text>
          </View>
        ) : null}
        {data.bankInfo ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>DADOS PARA PAGAMENTO</Text>
            <Text style={s.sectionText}>{data.bankInfo}</Text>
          </View>
        ) : null}

        <View style={s.sign}>
          <Text style={s.signBox}>Kayque Brito — Contratado</Text>
          <Text style={s.signBox}>{clientName === "—" ? "Cliente" : clientName} — Contratante</Text>
        </View>
        <Text style={s.rodape}>
          Orçamento {data.code} gerado pelo Portal KBOS · kayquebrito.com.br
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
