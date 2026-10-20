// Contatos repetidos: mesmo telefone (ignora +55, máscara e o 9 extra do celular) OU mesmo e-mail OU mesmo @instagram.
export type DupeContact = { id: string; name: string; phone: string | null; email?: string | null; company?: string | null; instagram?: string | null; extraEmails?: string[] | null; status: string; document?: string | null; createdAt?: string | Date | null };

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

/** Grupos com 2+ contatos da mesma pessoa (telefone, e-mail ou instagram, encadeados). O primeiro de cada grupo é o que deve ficar (mais completo; empate: o mais antigo). */
export function duplicateGroups<T extends DupeContact>(contacts: T[]): T[][] {
  const live = contacts.filter((c) => c.status !== "archived");
  const parent = live.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  live.forEach((c, i) => {
    const keys: string[] = [];
    const pk = phoneKey(c.phone);
    if (pk) keys.push("p:" + pk);
    for (const e of [c.email, ...(c.extraEmails ?? [])]) {
      const m = (e ?? "").trim().toLowerCase();
      if (m.includes("@")) keys.push("e:" + m);
    }
    const ig = (c.instagram ?? "").trim().toLowerCase().replace(/^@/, "");
    if (ig) keys.push("i:" + ig);
    for (const k of keys) {
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, T[]>();
  live.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]));
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => score(b) - score(a) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))));
}
