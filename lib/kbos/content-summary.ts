// Um registro de conteúdo conta uma vez; redes e cópias de origem não são entregas extras.
// Mesma regra do relatório do mês (`cycleMetrics`): cancelado fica fora do total; publicado e atrasado vêm do
// servidor (`phase`/`late` de `contentFlags`, que olham cada rede).
export const UNASSIGNED_BRAND = "";
export const contentBrand = (brand: string | null | undefined) => brand?.trim() || UNASSIGNED_BRAND;

type ContentRow = { id: string; brand: string | null; status: string; phase?: string; late?: boolean };
export function summarizeContent<T extends ContentRow>(rows: T[], knownBrands: string[] = []) {
  const contents = [...new Map(rows.map(row => [row.id, row])).values()];
  const byBrand = new Map<string, number>(knownBrands.map(brand => [brand, 0]));
  let total = 0, cancelled = 0, published = 0, late = 0;
  for (const row of contents) {
    if (row.status === "cancelado") { cancelled++; continue; }
    total++;
    const brand = contentBrand(row.brand);
    byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
    if ((row.phase ?? (row.status === "postado" ? "publicado" : "")) === "publicado") published++;
    if (row.late) late++;
  }
  // `active` = `total` (mantido para quem já usa o nome): ambos sem cancelados.
  return { contents, byBrand, total, active: total, cancelled, published, late };
}
