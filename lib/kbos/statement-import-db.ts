import { inArray } from "drizzle-orm";
import { db } from "./db";
import { transactions } from "./schema";
import { withKeys, type StatementPreviewRow, type StatementRow } from "./statement-import";

/** Marca como duplicado o que já foi importado antes (mesma chave em `gateway_ref`). */
export async function previewStatement(rows: StatementRow[]): Promise<StatementPreviewRow[]> {
  const keyed = withKeys(rows);
  if (keyed.length === 0) return [];
  const found = new Set<string>();
  for (let i = 0; i < keyed.length; i += 500) {
    const part = keyed.slice(i, i + 500).map((r) => r.key);
    const got = await db().select({ ref: transactions.gatewayRef }).from(transactions).where(inArray(transactions.gatewayRef, part));
    for (const g of got) if (g.ref) found.add(g.ref);
  }
  return keyed.map((r) => ({ ...r, duplicate: found.has(r.key) }));
}

/** Grava só o que ainda não existe. Tudo entra como PAGO (extrato é o que já aconteceu). */
export async function commitStatement(rows: StatementRow[], scope: "pessoal" | "empresa") {
  const prev = await previewStatement(rows);
  const fresh = prev.filter((r) => !r.duplicate);
  for (let i = 0; i < fresh.length; i += 200) {
    await db().insert(transactions).values(
      fresh.slice(i, i + 200).map((r) => ({
        tipo: r.tipo,
        descricao: r.descricao,
        categoria: r.categoria,
        valor: r.valor.toFixed(2),
        status: "pago" as const,
        vencimento: new Date(`${r.date}T12:00:00-03:00`),
        scope,
        gatewayRef: r.key,
        paymentMethod: "extrato",
        notes: "Importado do extrato",
      })),
    );
  }
  return { imported: fresh.length, skipped: prev.length - fresh.length };
}
