// PDF de orçamentos — @react-pdf/renderer, A4, dark theme integral.
//
// Documento em duas páginas (regra do KBOS — ver AGENTS.md):
// - Página 1 (Resumo Comercial): cabeçalho com logo, cliente, tabela de
//   itens (data de execução por linha), totalizador, condições de pagamento
//   (Pix/Cartão) e trio Prazo/Revisões/Validade.
// - Página 2 (Instrumento Particular de Prestação de Serviços): 7 cláusulas
//   de salvaguarda — o texto se adapta a projeto PONTUAL ou RECORRENTE
//   (`isRecurringBudget`) — e aceite por assinatura eletrônica simples.
//
// Identidade (LDP Design): fundo Blackweb `#11101E`, tinta Off White
// `#EDE6EC`, apoio GrayKay `#BDB7BC`, acento PurpleMag `#E80EFD` e gradiente
// BluePurple `#4F12C7` → PurpleMag. Display Cottorway Pro + Helvetica no corpo.
import { Document, Page, Text, View, StyleSheet, Image as PdfImage, Font, Svg, Defs, LinearGradient, RadialGradient, Stop, Rect, Path, renderToBuffer } from "@react-pdf/renderer";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BudgetItem } from "./schema";
import { calcBudgetWithDiscount, calcPaymentOptions, formatBRL, isRecurringInput } from "./budget-calc";
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
  // Qualificação do contratante (0010): documento, razão social e endereço.
  clientDocument?: string | null;
  contactDocument?: string | null;
  contactLegalName?: string | null;
  contactAddress?: string | null;
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
  // O hifenizador padrão do react-pdf segue regras do inglês ("CON-TRATANTE"):
  // em contrato pt-BR, palavras inteiras são mais legíveis e mais seguras.
  Font.registerHyphenationCallback((word) => [word]);
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
/** Logotipo íntegro do estúdio (`public/logo-kayque.png`, original sem cortes,
 *  altura elegante de 36px no cabeçalho) em data URI para o PDF escuro. */
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

// Paleta oficial. O BluePurple (#4F12C7) tem contraste baixo sobre o fundo:
// usado só em gradientes/preenchimentos, nunca como cor de texto.
// PurpleMag (rosa) com parcimônia: aparece só no filete em degradê do
// cabeçalho. Textos e destaques usam a tinta clara e o BluePurple.
const BG = "#11101e";
const INK = "#ede6ec";
const SOFT = "#bdb7bc";
const FAINT = "rgba(237,230,236,0.46)";
const MAG = "#e80efd";
const BLUE = "#4f12c7";
const CARD = "rgba(237,230,236,0.04)";
const HAIR = "rgba(237,230,236,0.1)";

/** Escopo padrão de entrega por evento (só em orçamentos de cobertura). */
const EVENT_SCOPE = "1 vídeo de até 1m (horizontal/vertical) + 20 fotos editadas por evento + material bruto sem edição";

// A4 = 595 × 842 pt. Margem 34 → área útil de 527 pt; a métrica abaixo foi
// calibrada para o resumo e o contrato caberem, cada um, em UMA folha.
const PAGE_PAD = 34;
const CONTENT_W = 595 - PAGE_PAD * 2;

const s = StyleSheet.create({
  page: { backgroundColor: BG, color: INK, padding: PAGE_PAD, fontSize: 9, lineHeight: 1.4, fontFamily: "Helvetica" },
  // Cabeçalho: logo íntegra + bloco do documento alinhado à direita.
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { height: 30 },
  brandFallback: { fontSize: 14, letterSpacing: 3, color: INK, fontFamily: DISPLAY, fontWeight: 700 },
  docSide: { flexDirection: "column", alignItems: "flex-end" },
  docLabel: { fontSize: 7, letterSpacing: 2.6, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
  docCode: { fontSize: 18, lineHeight: 1.1, color: INK, marginTop: 5, fontFamily: DISPLAY, fontWeight: 700 },
  docMeta: { fontSize: 8, color: SOFT, marginTop: 3 },
  statusPill: { marginTop: 5, borderWidth: 1, borderColor: HAIR, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 },
  statusText: { fontSize: 6.5, color: SOFT, letterSpacing: 2, fontFamily: DISPLAY, fontWeight: 700 },
  gradRuleWrap: { marginTop: 10, marginBottom: 2 },
  // Cards (glassmorphism: véu claro + borda fina + radius).
  grid: { flexDirection: "row", gap: 8, marginTop: 10 },
  card: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  cardLabel: { fontSize: 6.5, letterSpacing: 2, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
  cardTitle: { fontSize: 10, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  cardText: { fontSize: 9, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  cardLine: { fontSize: 8, color: SOFT, marginTop: 1 },
  sectionTitle: { fontSize: 7, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 2, color: FAINT, marginTop: 11, marginBottom: 5 },
  // Datas legadas: badges compactos em pílula.
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  dateBadge: { borderWidth: 1, borderColor: HAIR, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, backgroundColor: CARD },
  dateText: { fontSize: 8, color: SOFT, fontFamily: DISPLAY, fontWeight: 700 },
  // Tabela emoldurada em vidro: cabeçalho discreto + filetes finos.
  tableWrap: { borderWidth: 1, borderColor: HAIR, borderRadius: 8, overflow: "hidden", backgroundColor: CARD },
  tableHead: {
    flexDirection: "row",
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: FAINT,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderBottomWidth: 1,
    borderBottomColor: HAIR,
  },
  tableRow: { flexDirection: "row", paddingVertical: 5.5, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: "rgba(237,230,236,0.06)", fontSize: 9 },
  colItem: { width: "52%", paddingRight: 8 },
  colQty: { width: "8%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  colUnit: { width: "20%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  colTotal: { width: "20%", textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  itemName: { fontFamily: DISPLAY, fontWeight: 700, color: INK },
  desc: { fontSize: 7.5, color: SOFT, marginTop: 1 },
  itemDate: { fontSize: 7.5, color: SOFT, fontFamily: DISPLAY, fontWeight: 700 },
  // Escopo padrão por evento.
  scopeBox: { marginTop: 6, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 },
  scopeLabel: { fontSize: 6.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 2, color: FAINT },
  scopeText: { fontSize: 8.5, color: INK, marginTop: 2 },
  // Totalizador à direita.
  totals: { marginTop: 8, alignItems: "flex-end" },
  totRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 1 },
  totLabel: { fontSize: 8, color: SOFT },
  totValue: { fontSize: 9, color: INK, width: 110, textAlign: "right", fontFamily: DISPLAY, fontWeight: 700 },
  grandLabel: { fontSize: 7.5, letterSpacing: 2, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
  grandValue: { fontSize: 19, lineHeight: 1.15, color: INK, fontFamily: DISPLAY, fontWeight: 300 },
  perMonth: { fontSize: 9, color: SOFT, marginLeft: -10 },
  // Pagamento: 3 cards em vidro; a condição escolhida ganha borda PurpleMag.
  payRow: { flexDirection: "row", gap: 8 },
  payCard: { flex: 1, borderWidth: 1, borderColor: HAIR, borderRadius: 8, backgroundColor: CARD, paddingVertical: 8, paddingHorizontal: 10 },
  payCardHot: { flex: 1, borderWidth: 1, borderColor: "rgba(237,230,236,0.3)", borderRadius: 8, backgroundColor: "rgba(237,230,236,0.07)", paddingVertical: 8, paddingHorizontal: 10 },
  payTitle: { fontSize: 6.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.2, color: SOFT },
  payTitleHot: { fontSize: 6.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.2, color: INK },
  payValue: { fontSize: 11, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  payHint: { fontSize: 7.5, color: SOFT, marginTop: 1 },
  // Pix em destaque (linha única).
  pixBox: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: BLUE, paddingVertical: 7, paddingHorizontal: 11 },
  pixLabel: { fontSize: 6.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 2, color: FAINT },
  pixValue: { fontSize: 9, fontFamily: DISPLAY, fontWeight: 700, color: INK, flex: 1 },
  // Trio Prazo / Revisões / Validade.
  trio: { flexDirection: "row", gap: 8, marginTop: 8 },
  trioCard: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  trioLabel: { fontSize: 6.5, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.8, color: FAINT },
  trioValue: { fontSize: 9, color: INK, marginTop: 3, fontFamily: DISPLAY, fontWeight: 700 },
  // Assinaturas: Contratado com rubrica; Contratante com espaço livre p/ assinar.
  sign: { marginTop: 18, flexDirection: "row", justifyContent: "space-between" },
  signCol: { width: "44%", flexDirection: "column", alignItems: "center" },
  signScript: { fontSize: 18, color: INK, fontFamily: "Helvetica-BoldOblique", marginBottom: 2, height: 24 },
  signBlank: { height: 24, marginBottom: 2 },
  signBox: { width: "100%", borderTopWidth: 1, borderTopColor: SOFT, paddingTop: 4, fontSize: 8, color: SOFT, textAlign: "center", fontFamily: DISPLAY, fontWeight: 700 },
  signSub: { fontSize: 7, color: FAINT, textAlign: "center", marginTop: 2 },
  footer: { marginTop: "auto", paddingTop: 8, borderTopWidth: 1, borderTopColor: HAIR, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.5, color: FAINT, fontFamily: DISPLAY, fontWeight: 700 },
  // Página 2 — cláusulas em duas colunas de vidro (cabe numa folha).
  clauseCols: { flexDirection: "row", gap: 8 },
  clauseCol: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: HAIR, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 11 },
  clause: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(237,230,236,0.06)" },
  clauseLast: { paddingVertical: 6 },
  clauseTitle: { fontSize: 7, fontFamily: DISPLAY, fontWeight: 700, letterSpacing: 1.4, color: INK, marginBottom: 2 },
  clauseText: { fontSize: 7.8, color: SOFT, textAlign: "justify", lineHeight: 1.4 },
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

const MONTH_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function monthYearLabel(ym: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return null;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return null;
  const cap = MONTH_PT[idx].charAt(0).toUpperCase() + MONTH_PT[idx].slice(1);
  return `${cap}/${m[1]}`;
}

/** Datas ISO válidas dos itens + datas legadas do orçamento, ordenadas. */
function executionDates(data: BudgetPdfData): string[] {
  return [...(data.items || []).map((i) => i.date), ...(data.eventDates || [])]
    .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
}

/**
 * Orçamento recorrente (mensalidade) x projeto pontual. Decide o texto do
 * contrato, então é conservador: palavra-chave explícita no título/termos ou
 * execução espalhada por 3+ meses distintos. Nunca por nome de cliente.
 */
export function isRecurringBudget(data: Pick<BudgetPdfData, "title" | "terms" | "items" | "eventDates">): boolean {
  return isRecurringInput({ title: data.title, terms: data.terms, dates: executionDates(data as BudgetPdfData) });
}

/** Orçamento de cobertura/captação (exibe o escopo padrão por evento). */
function isCoverageBudget(data: BudgetPdfData): boolean {
  const hay = `${data.title || ""} ${(data.items || []).map((i) => i.service).join(" ")}`;
  return /cobertura|evento|capta[çc][ãa]o|di[áa]ria|grava[çc][ãa]o|filmagem|ensaio/i.test(hay);
}

/** Período de execução: "Outubro/2026 a Fevereiro/2027 · 5 meses" (recorrente) ou "01/10/2026 a 04/10/2026". */
function executionPeriodLabel(data: BudgetPdfData, recurring: boolean): string | null {
  const all = executionDates(data);
  if (all.length === 0) return null;
  if (!recurring) {
    const first = fmtDate(all[0]);
    const last = fmtDate(all[all.length - 1]);
    return first === last ? first : `${first} a ${last}`;
  }
  const months = [...new Set(all.map((d) => d.slice(0, 7)))];
  const first = monthYearLabel(months[0]);
  const last = monthYearLabel(months[months.length - 1]);
  if (!first || !last) return null;
  return months.length > 1 ? `${first} a ${last} · ${months.length} meses` : `${first} · 1 mês`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type Clause = { title: string; body: string };

/**
 * As 7 cláusulas de salvaguarda da página 2. Texto único para qualquer
 * cliente: o que muda entre projeto pontual e recorrente é só o regime de
 * vigência, cobrança e rescisão. Escopo específico de um cliente entra em
 * "Observações" (campo `terms`), que vira a cláusula 8.
 */
export function buildContractClauses(data: BudgetPdfData, total: number): Clause[] {
  const recurring = isRecurringBudget(data);
  const period = executionPeriodLabel(data, recurring);
  const title = data.title?.trim() || "descrito na página 1";
  const pix = pixLine(data.bankInfo);
  const pay = calcPaymentOptions(total);
  const revisions = plural(data.revisionsCount ?? 2, "rodada de revisão", "rodadas de revisão");
  const delivery =
    data.deliveryDeadline?.trim() ||
    (recurring
      ? "material bruto em até 5 dias úteis após cada captação e material editado em até 10 dias úteis"
      : "conforme o cronograma da página 1");

  const payment = recurring
    ? `Plano pré-pago: cada mensalidade é paga antecipadamente via Pix (${pix}) até o dia 5 do mês de referência, e a primeira na assinatura deste instrumento. Planos mensais não admitem parcelamento, entrada + saldo nem desconto à vista.`
    : data.paymentCondition === "cash"
      ? `Pagamento à vista via Pix (${pix}) na assinatura deste instrumento, com 10% de desconto: ${formatBRL(pay.cash)}.`
      : data.paymentCondition === "installments"
        ? `Pagamento em duas parcelas, via Pix (${pix}) ou cartão: ${formatBRL(pay.entry)} na assinatura e ${formatBRL(pay.balance)} na entrega final.`
        : data.paymentCondition === "card"
          ? "Pagamento por cartão de crédito ou débito, pelo valor integral, na assinatura deste instrumento."
          : `Pagamento conforme a condição escolhida na página 1, via Pix (${pix}) ou cartão.`;

  return [
    {
      title: "1 · OBJETO",
      body: `Prestação${recurring ? " recorrente" : ""}, pelo CONTRATADO ao CONTRATANTE, dos serviços do projeto "${title}", conforme itens, escopo e cronograma do resumo comercial (página 1), parte integrante deste instrumento.`,
    },
    {
      title: "2 · VIGÊNCIA E ESCOPO",
      body: recurring
        ? `Vigência: ${period ?? "conforme o cronograma da página 1"}, com execução e entregas mensais contínuas. Cada mês contempla o escopo integral da página 1; meses sem execução por indisponibilidade do CONTRATANTE não geram abatimento, salvo acordo por escrito.`
        : `Vigência: ${period ? `${period}, até a entrega final aprovada` : "da assinatura até a entrega final aprovada"}. O escopo limita-se aos itens da página 1; qualquer demanda fora dele é orçada à parte, antes da execução.`,
    },
    {
      title: "3 · AGENDAMENTO, REMARCAÇÃO E ATRASOS",
      body: `Captações, reuniões e entregas presenciais são agendadas com antecedência mínima de 72 horas. Remarcações são livres até 48 horas antes; depois disso, incide taxa de 30% sobre o valor ${recurring ? "da mensalidade" : "do item remarcado"}, referente a deslocamento e reserva de agenda. Atrasos do CONTRATANTE superiores a 30 minutos reduzem proporcionalmente o tempo de execução, sem prorrogação.`,
    },
    {
      title: "4 · PRAZOS DE ENTREGA E REVISÕES",
      body: `Prazo de entrega: ${delivery}. Inclui ${revisions} ${recurring ? "por ciclo mensal" : "por entrega"}; ajustes além disso são orçados à parte. Os prazos contam a partir do recebimento dos materiais e aprovações que dependem do CONTRATANTE. Com a aprovação final, a entrega considera-se aceita.`,
    },
    {
      title: "5 · VALOR E PAGAMENTO",
      body: `${recurring ? `Valor mensal: ${formatBRL(total)}, devido em cada mês da vigência${period ? ` (${period})` : ""}.` : `Valor total contratado: ${formatBRL(total)}.`} ${payment} Atraso superior a 7 dias suspende execução e entregas até a regularização, sem prorrogação de prazos.`,
    },
    {
      title: "6 · PROPRIEDADE INTELECTUAL E USO DE IMAGEM",
      body: `Com a quitação integral ${recurring ? "de cada mensalidade" : "do valor contratado"}, o CONTRATANTE recebe cessão de uso do material entregue${recurring ? " naquele mês" : ""}, para as finalidades do projeto e por prazo indeterminado. Arquivos abertos e material bruto integram a entrega somente quando previstos na página 1. O CONTRATADO pode exibir o trabalho em portfólio, site e redes profissionais, salvo oposição por escrito do CONTRATANTE antes da publicação.`,
    },
    {
      title: "7 · RESCISÃO E FORO",
      body: recurring
        ? "Qualquer parte pode rescindir com aviso prévio de 30 dias, sem multa rescisória: o mês já pago é entregue integralmente e nenhuma mensalidade é devida após o fim do aviso. Fica eleito o foro da comarca de Belém/PA."
        : "Qualquer parte pode rescindir mediante aviso por escrito, quitando-se as etapas já executadas. Na rescisão imotivada pelo CONTRATANTE após o início da execução, os valores das etapas concluídas não são reembolsáveis e incide multa de 20% sobre o saldo remanescente. Fica eleito o foro da comarca de Belém/PA.",
    },
  ];
}

/** Pix em linha única: "Nome · Banco · chave" (o campo pode vir em várias linhas). */
function pixLine(bankInfo: string | null): string {
  const lines = (bankInfo?.trim() || DEFAULT_PIX_INFO).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.join(" · ");
}

/** "Nome / Empresa" sem repetir quando os dois são o mesmo (ex.: "AlMare Hostel" x "Al Mare Hostel"). */
function partyName(name: string, company: string | null | undefined): string {
  const key = (v: string) => v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  if (!company) return name;
  if (name === "—" || key(name) === key(company)) return company;
  return `${name} / ${company}`;
}

/** Divide as cláusulas em duas colunas de altura parecida (pelo volume de texto), mantendo a ordem. */
function splitBalanced(clauses: Clause[]): [Clause[], Clause[]] {
  const weight = (c: Clause) => c.body.length + 90; // +título/respiro
  const totalW = clauses.reduce((a, c) => a + weight(c), 0);
  let acc = 0;
  let cut = clauses.length;
  for (let i = 0; i < clauses.length; i++) {
    if (acc + weight(clauses[i]) / 2 > totalW / 2) {
      cut = i;
      break;
    }
    acc += weight(clauses[i]);
  }
  return [clauses.slice(0, cut), clauses.slice(cut)];
}

// Ondas (waveforms) da home do site, bem discretas no topo da folha.
const WAVES = [64, 92, 120, 148, 176, 204].map(
  (y, i) => `M0 ${y} C 120 ${y - 18}, 210 ${y + 22}, ${300 + i * 8} ${y + 2} S 500 ${y - 20}, 595 ${y + 8}`
);

/** Fundo da folha: o véu em degradê da hero (BluePurple, rosa só no fim) + waveforms. */
function PageBackdrop({ id }: { id: string }) {
  return (
    <Svg fixed style={{ position: "absolute", top: 0, left: 0, width: 595, height: 842 }} viewBox="0 0 595 842">
      <Defs>
        <RadialGradient id={`${id}-veil`} cx="0.18" cy="0" r="0.75">
          <Stop offset="0%" stopColor={BLUE} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={BLUE} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}-mag`} cx="1" cy="0.02" r="0.5">
          <Stop offset="0%" stopColor={MAG} stopOpacity={0.06} />
          <Stop offset="100%" stopColor={MAG} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={595} height={842} fill={`url(#${id}-veil)`} />
      <Rect x={0} y={0} width={595} height={842} fill={`url(#${id}-mag)`} />
      {WAVES.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={INK} strokeOpacity={0.05 - i * 0.006} strokeWidth={0.6} />
      ))}
    </Svg>
  );
}

/** Cabeçalho comum às duas páginas: logo íntegra + bloco do documento + filete em gradiente. */
function DocHeader({ id, logo, label, code, date, status }: { id: string; logo: string | null; label: string; code: string; date: string; status?: string }) {
  return (
    <>
      <View style={s.header}>
        <View>{logo ? <PdfImage src={logo} style={s.logo} /> : <Text style={s.brandFallback}>KAYQUE BRITO</Text>}</View>
        <View style={s.docSide}>
          <Text style={s.docLabel}>{label}</Text>
          <Text style={s.docCode}>{code}</Text>
          <Text style={s.docMeta}>Emitido em {date}</Text>
          {status ? (
            <View style={s.statusPill}>
              <Text style={s.statusText}>{status}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={s.gradRuleWrap}>
        <Svg width={CONTENT_W} height={2}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={BLUE} />
              <Stop offset="70%" stopColor={MAG} stopOpacity={0.4} />
              <Stop offset="100%" stopColor={MAG} stopOpacity={0.04} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={CONTENT_W} height={2} rx={1} fill={`url(#${id})`} />
        </Svg>
      </View>
    </>
  );
}

export function BudgetPdf({ data }: { data: BudgetPdfData }) {
  ensureFonts();
  const items = data.items || [];
  const clientName = data.contactName || data.clientName || "—";
  const clientCompany = data.contactCompany || data.clientCompany;
  const eventDates = (data.eventDates || []).filter(Boolean);
  const itemsWithDate = items.filter((it) => !!it.date).length;
  const { subtotal, discountAmount, total } = calcBudgetWithDiscount(
    items,
    data.discountType,
    data.discountValue
  );
  const pay = calcPaymentOptions(total);
  const pix = pixLine(data.bankInfo);
  const logo = brandLogo();
  const isPay = (id: string) => (data.paymentCondition || "") === id;
  const revisions =
    data.revisionsCount == null ? null : plural(data.revisionsCount, "revisão inclusa", "revisões inclusas");
  const contractorName = "Kayque Brito";
  const contractingName = partyName(clientName, clientCompany);
  const clientDoc = data.contactDocument || data.clientDocument || null;
  const clientDocLabel = clientDoc && clientDoc.replace(/[^0-9A-Z]/gi, "").length === 11 ? "CPF" : "CNPJ";
  const recurring = isRecurringBudget(data);
  const period = executionPeriodLabel(data, recurring);
  const clauses = [
    ...buildContractClauses(data, total),
    ...(data.terms ? [{ title: "8 · CONDIÇÕES ESPECÍFICAS DESTE PROJETO", body: data.terms }] : []),
    {
      title: `${data.terms ? 9 : 8} · ACEITE E ASSINATURA ELETRÔNICA`,
      body: `As partes declaram ter lido e aceito o resumo comercial (página 1) e as cláusulas deste instrumento. O aceite por assinatura eletrônica simples (Lei nº 14.063/2020) — rubrica eletrônica ou confirmação por e-mail/WhatsApp que identifique o documento ${data.code} — é admitido pelas partes como válido, nos termos do art. 10, § 2º, da MP nº 2.200-2/2001.`,
    },
  ];
  const [colA, colB] = splitBalanced(clauses);
  const docDate = fmtDate(data.createdAt);
  return (
    <Document title={`Orçamento ${data.code} — Kayque Brito`}>
      <Page size="A4" style={s.page}>
        <PageBackdrop id="kb-bg-1" />
        <DocHeader
          id="kb-rule-1"
          logo={logo}
          label="ORÇAMENTO"
          code={data.code}
          date={docDate}
          status={(STATUS_LABEL[data.status] ?? data.status).toUpperCase()}
        />

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
              {plural(items.length, "item", "itens")}
              {recurring
                ? " · Plano mensal pré-pago"
                : data.paymentCondition
                  ? ` · ${PAY_LABEL[data.paymentCondition] ?? data.paymentCondition}`
                  : ""}
            </Text>
          </View>
        </View>

        {/* ── Itens (data de execução por linha) ───────── */}
        <Text style={s.sectionTitle}>SERVIÇOS</Text>
        <View style={s.tableWrap}>
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
                {it.description || it.date ? (
                  <Text style={s.desc}>
                    {it.description ?? ""}
                    {it.description && it.date ? "  ·  " : ""}
                    {it.date ? <Text style={s.itemDate}>Execução {fmtDate(it.date)}</Text> : null}
                  </Text>
                ) : null}
              </View>
              <Text style={s.colQty}>{it.quantity}</Text>
              <Text style={s.colUnit}>{formatBRL(it.unitPrice)}</Text>
              <Text style={s.colTotal}>{formatBRL(it.total)}</Text>
            </View>
          ))}
        </View>

        {/* ── Escopo padrão por evento ─────────────────── */}
        {isCoverageBudget(data) ? (
          <View style={s.scopeBox} wrap={false}>
            <Text style={s.scopeLabel}>ESCOPO PADRÃO POR EVENTO</Text>
            <Text style={s.scopeText}>{EVENT_SCOPE}</Text>
          </View>
        ) : null}

        {/* ── Datas (fallback legado: sem data por item) ── */}
        {eventDates.length && itemsWithDate === 0 && !recurring ? (
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

        {/* ── Totalizador ──────────────────────────────── */}
        <View style={s.totals} wrap={false}>
          {discountAmount > 0 ? (
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal</Text>
            <Text style={s.totValue}>{formatBRL(subtotal)}</Text>
          </View>
          ) : null}
          {discountAmount > 0 ? (
            <View style={s.totRow}>
              <Text style={s.totLabel}>
                Desconto{data.discountType === "percent" && Number(data.discountValue) > 0 ? ` (${Number(data.discountValue)}%)` : ""}
              </Text>
              <Text style={s.totValue}>−{formatBRL(discountAmount)}</Text>
            </View>
          ) : null}
          <View style={[s.totRow, { marginTop: 3 }]}>
            <Text style={s.grandLabel}>{recurring ? "MENSALIDADE" : "TOTAL"}</Text>
            <Text style={s.grandValue}>{formatBRL(total)}</Text>
            {recurring ? <Text style={s.perMonth}>/mês</Text> : null}
          </View>
          {recurring && period ? (
            <View style={[s.totRow, { marginTop: 8 }]}>
              <Text style={s.totLabel}>Vigência do contrato: {period}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Pagamento ────────────────────────────────── */}
        <Text style={s.sectionTitle}>CONDIÇÕES DE PAGAMENTO</Text>
        <View wrap={false}>
          {recurring ? (
          <View style={s.payRow}>
            <View style={s.payCardHot}>
              <Text style={s.payTitleHot}>PLANO MENSAL PRÉ-PAGO</Text>
              <Text style={s.payValue}>{formatBRL(total)} /mês</Text>
              <Text style={s.payHint}>Pix até o dia 5 de cada mês · 1ª mensalidade na assinatura</Text>
            </View>
            <View style={s.payCard}>
              <Text style={s.payTitle}>CANCELAMENTO</Text>
              <Text style={s.payValue}>Sem multa</Text>
              <Text style={s.payHint}>Aviso de 30 dias · o mês pago é entregue integralmente</Text>
            </View>
          </View>
          ) : (
          <View style={s.payRow}>
            <View style={isPay("cash") ? s.payCardHot : s.payCard}>
              <Text style={isPay("cash") ? s.payTitleHot : s.payTitle}>À VISTA · 10% OFF</Text>
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
          )}
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

        {/* Observações (`terms`) saem só na página 2, como cláusula 8: evita
            texto duplicado e mantém o resumo comercial em uma página. */}

        {/* ── Rodapé ───────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>Orçamento {data.code} · Studio Kayque Brito</Text>
          <Text style={s.footerText}>kayquebrito.com.br · 1/2</Text>
        </View>
      </Page>

      {/* ═══ Página 2 — Termos e Contrato Formal ═══ */}
      <Page size="A4" style={s.page}>
        <PageBackdrop id="kb-bg-2" />
        <DocHeader id="kb-rule-2" logo={logo} label="INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS" code={data.code} date={docDate} />

        <View style={s.grid}>
          <View style={s.card}>
            <Text style={s.cardLabel}>CONTRATADO</Text>
            <Text style={s.cardTitle}>Kayque Brito — Studio Kayque Brito</Text>
            <Text style={s.cardLine}>Design, desenvolvimento e audiovisual · kayquebrito.com.br</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardLabel}>CONTRATANTE</Text>
            <Text style={s.cardTitle}>{contractingName}</Text>
            {data.contactLegalName && data.contactLegalName !== clientCompany ? <Text style={s.cardLine}>{data.contactLegalName}</Text> : null}
            {clientDoc ? <Text style={s.cardLine}>{clientDocLabel}: {clientDoc}</Text> : null}
            {data.contactAddress ? <Text style={s.cardLine}>{data.contactAddress}</Text> : null}
            {[data.contactEmail, data.contactPhone].filter(Boolean).length ? (
              <Text style={s.cardLine}>{[data.contactEmail, data.contactPhone].filter(Boolean).join(" · ")}</Text>
            ) : null}
            {period ? <Text style={s.cardLine}>Vigência: {period}</Text> : null}
          </View>
        </View>

        <Text style={s.sectionTitle}>CLÁUSULAS CONTRATUAIS</Text>
        <View style={s.clauseCols}>
          {[colA, colB].map((col, ci) => (
            <View key={ci} style={s.clauseCol}>
              {col.map((c, i) => (
                <View key={c.title} style={i === col.length - 1 ? s.clauseLast : s.clause} wrap={false}>
                  <Text style={s.clauseTitle}>{c.title}</Text>
                  <Text style={s.clauseText}>{c.body}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* ── Assinaturas: rubrica do Contratado; espaço livre p/ o Contratante ── */}
        <View style={s.sign} wrap={false}>
          <View style={s.signCol}>
            <Text style={s.signScript}>{contractorName}</Text>
            <Text style={s.signBox}>{contractorName} — Contratado</Text>
            <Text style={s.signSub}>Assinatura eletrônica / rubrica</Text>
          </View>
          <View style={s.signCol}>
            <View style={s.signBlank} />
            <Text style={s.signBox}>{contractingName} — Contratante</Text>
            <Text style={s.signSub}>Assinatura eletrônica / rubrica</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Contrato {data.code} · Studio Kayque Brito</Text>
          <Text style={s.footerText}>kayquebrito.com.br · 2/2</Text>
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
