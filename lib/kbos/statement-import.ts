// Importador de extrato bancário (PicPay e similares): CSV e OFX → lançamentos.
// Só lê e normaliza; gravar no banco fica em statement-import-db.ts. Sem chaves nem IA externa:
// a categoria vem de regras simples por palavra-chave (o usuário pode corrigir depois).
import { createHash } from "node:crypto";
import { parseCsvRows } from "./contact-import";

export type StatementRow = {
  date: string; // yyyy-mm-dd
  descricao: string;
  valor: number; // sempre positivo
  tipo: "entrada" | "saida";
  categoria: string | null;
};
export type StatementPreviewRow = StatementRow & { key: string; duplicate: boolean };

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** "1.234,56", "-R$ 12,30", "R$ 5", "12.50" → número com sinal (null se não for número). */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[R$\s]/gi, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  if (!s || !/\d/.test(s)) return null;
  const neg = s.startsWith("-") || s.endsWith("-");
  s = s.replace(/-/g, "").replace(/^\+/, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g)?.length ?? 0) > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd (com hora) ou yyyymmdd[hhmmss] → yyyy-mm-dd. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{6})?/);
  if (m) return valid(m[1], m[2], m[3]);
  const b = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (b) return valid(b[3].length === 2 ? `20${b[3]}` : b[3], b[2], b[1]);
  return null;
}
function valid(y: string, mo: string, d: string): string | null {
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/ifood|rappi|restaurante|lanchonete|padaria|a[cç]ai|pizz|burger|mercado|supermerc|atacad/, "Alimentação"],
  [/uber|99 ?pop|99app|posto|combust|estaciona|pedagio|metro|onibus/, "Transporte"],
  [/netflix|spotify|youtube|disney|prime video|hbo|apple\.com|google play|assinatura/, "Assinaturas"],
  [/farmac|drogaria|droga ?raia|hospital|clinica|consulta|laborat/, "Saúde"],
  [/energia|enel|equatorial|agua|cosanpa|internet|vivo|claro|tim |oi |telefon/, "Contas da casa"],
  [/aluguel|condominio|iptu/, "Moradia"],
  [/salario|pro.?labore|rendimento|cashback|reembolso|estorno/, "Receitas diversas"],
  [/vercel|hostinger|openai|anthropic|google cloud|aws|github|dominio|registro\.br|adobe|figma|canva/, "Ferramentas"],
  [/tarifa|iof|juros|anuidade/, "Taxas"],
];
export function guessCategory(descricao: string, tipo: "entrada" | "saida"): string | null {
  const d = strip(descricao);
  for (const [re, cat] of CATEGORY_RULES) if (re.test(d)) return cat;
  return tipo === "entrada" ? "Receitas diversas" : null;
}

// ── OFX ───────────────────────────────────────────────────────────────────
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}
export function parseOfx(text: string): StatementRow[] {
  const out: StatementRow[] = [];
  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)) {
    const b = m[1];
    const date = parseDate(tag(b, "DTPOSTED") ?? "");
    const amount = parseMoney(tag(b, "TRNAMT") ?? "");
    if (!date || amount === null || amount === 0) continue;
    const descricao = (tag(b, "MEMO") || tag(b, "NAME") || "Sem descrição").replace(/&amp;/g, "&").slice(0, 200);
    const tipo = amount > 0 ? "entrada" : "saida";
    out.push({ date, descricao, valor: Math.abs(amount), tipo, categoria: guessCategory(descricao, tipo) });
  }
  return out;
}

// ── CSV ───────────────────────────────────────────────────────────────────
export function parseStatementCsv(text: string): StatementRow[] {
  const rows = parseCsvRows(text);
  const hi = rows.findIndex((r) => r.some((c) => /^data/.test(strip(c))) && r.some((c) => /valor|quantia|montante/.test(strip(c))));
  if (hi < 0) return [];
  const head = rows[hi].map(strip);
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iDate = find(/^data/);
  const iValor = find(/^valor|^quantia|^montante/);
  const iDesc = find(/descri|hist[oó]rico|estabelec|titulo|transa[cç]|detalhe|favorecido|nome/);
  const iTipo = find(/^tipo|natureza|d[eé]bito\/cr[eé]dito/);
  const out: StatementRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[iDate] ?? "");
    let amount = parseMoney(r[iValor] ?? "");
    if (!date || amount === null || amount === 0) continue;
    const kind = iTipo >= 0 ? strip(r[iTipo] ?? "") : "";
    if (/saida|debito|pagamento|compra|envio|enviado|despesa/.test(kind)) amount = -Math.abs(amount);
    else if (/entrada|credito|recebimento|recebido|deposito/.test(kind)) amount = Math.abs(amount);
    const descricao = ((iDesc >= 0 ? r[iDesc] : "") || (iTipo >= 0 ? r[iTipo] : "") || "Sem descrição").trim().slice(0, 200);
    const tipo = amount > 0 ? "entrada" : "saida";
    out.push({ date, descricao, valor: Math.abs(amount), tipo, categoria: guessCategory(descricao, tipo) });
  }
  return out;
}

export function parseStatement(text: string): StatementRow[] {
  return /<STMTTRN>/i.test(text) ? parseOfx(text) : parseStatementCsv(text);
}

/** Chave estável por lançamento; o mesmo valor/descrição no mesmo dia ganha sufixo (#1, #2…) para não colar. */
export function withKeys(rows: StatementRow[]): (StatementRow & { key: string })[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.tipo}|${r.valor.toFixed(2)}|${strip(r.descricao).replace(/\s+/g, " ")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = "extrato:" + createHash("sha1").update(`${base}#${n}`).digest("hex").slice(0, 24);
    return { ...r, key };
  });
}
