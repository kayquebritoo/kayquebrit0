// CPF/CNPJ: limpeza, validação dos dígitos verificadores e máscara.
// Puro (client-safe). Aceita o CNPJ alfanumérico da Receita (a partir de
// jul/2026): 12 caracteres A–Z/0–9 + 2 dígitos verificadores, onde cada
// caractere vale (código ASCII − 48).

/** Mantém só dígitos e letras maiúsculas (`12.ABC.345/01DE-35` → `12ABC34501DE35`). */
export function cleanDocument(v: string): string {
  return (v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCPF(v: string): boolean {
  const d = cleanDocument(v);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(v: string): boolean {
  const d = cleanDocument(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const val = (c: string) => c.charCodeAt(0) - 48;
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += val(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** "pf" para CPF, "pj" para CNPJ, null quando não é nenhum dos dois. */
export function documentKind(v: string): "pf" | "pj" | null {
  if (isValidCPF(v)) return "pf";
  if (isValidCNPJ(v)) return "pj";
  return null;
}

export function formatDocument(v: string): string {
  const d = cleanDocument(v);
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return v;
}

/** Máscara progressiva enquanto digita (decide CPF × CNPJ pelo tamanho). */
export function maskDocumentInput(v: string): string {
  const d = cleanDocument(v).slice(0, 14);
  if (d.length <= 11 && /^\d*$/.test(d)) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return d
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, "$1.$2.$3/$4")
    .replace(/\/(.{4})(.{1,2})$/, "/$1-$2");
}
