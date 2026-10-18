// Contatos repetidos: mesmo telefone (ignora +55, máscara e o 9 extra do celular).
export type DupeContact = { id: string; name: string; phone: string | null; email?: string | null; company?: string | null; status: string; document?: string | null; createdAt?: string | Date | null };

/** Chave estável do telefone: DDD + últimos 8 dígitos. null se não der para saber. */
export function phoneKey(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

const score = (c: DupeContact) =>
  (c.status === "client" ? 100 : 0) + (c.document ? 10 : 0) + (c.email ? 5 : 0) + (c.company ? 3 : 0) +
  // nome de verdade vale mais que o número usado como nome
  (/\d{4,}/.test(c.name) ? 0 : 20);

/** Grupos com 2+ contatos do mesmo telefone. O primeiro de cada grupo é o que deve ficar (mais completo; empate: o mais antigo). */
export function duplicateGroups<T extends DupeContact>(contacts: T[]): T[][] {
  const map = new Map<string, T[]>();
  for (const c of contacts) {
    if (c.status === "archived") continue;
    const k = phoneKey(c.phone);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return [...map.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => score(b) - score(a) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))));
}
