// Um registro de conteúdo conta uma vez; redes e cópias de origem não são entregas extras.
export const UNASSIGNED_BRAND = "";
export const contentBrand = (brand: string | null | undefined) => brand?.trim() || UNASSIGNED_BRAND;

type ContentRow = { id: string; brand: string | null; status: string };
export function summarizeContent<T extends ContentRow>(rows: T[], knownBrands: string[] = []) {
  const contents = [...new Map(rows.map(row => [row.id, row])).values()];
  const byBrand = new Map<string, number>(knownBrands.map(brand => [brand, 0]));
  let active = 0;
  for (const row of contents) {
    const brand = contentBrand(row.brand);
    byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
    if (row.status !== "cancelado") active++;
  }
  return { contents, byBrand, total: contents.length, active, cancelled: contents.length - active };
}
