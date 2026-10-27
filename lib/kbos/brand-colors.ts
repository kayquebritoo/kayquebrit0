// Cor de cada empresa do Grupo Atalaia VIP no calendário (admin e portal). Só para distinguir marcas;
// o estágio do post continua com as cores de status. Hotel azul-mar, Lounge dourado, Praça laranja.
export const BRAND_COLORS: Record<string, string> = { Hotel: "#3BA6FF", Lounge: "#E8B93A", Praça: "#FF6A2B" };
export const BRAND_LIST = Object.keys(BRAND_COLORS);
export const brandColor = (brand: string | null | undefined): string | null => (brand ? BRAND_COLORS[brand] ?? null : null);

/** Logo de cada empresa (admin e portal). */
export const BRAND_LOGOS: Record<string, string> = {
  Hotel: "/brands/atalaia/hotel.png",
  Lounge: "/brands/atalaia/lounge.png",
  Praça: "/brands/atalaia/praca.png",
};

/** Empresas do post na ordem: a principal (brand) e as do colab. */
export const brandsOf = (p: { brand: string | null; collabBrands?: string[] | null }) => (p.brand ? [p.brand, ...(p.collabBrands ?? []).filter((b) => b !== p.brand)] : []);
/** "Hotel + Lounge + Praça" quando é colab; null sem empresa. */
export const brandLabel = (p: { brand: string | null; collabBrands?: string[] | null }) => brandsOf(p).join(" + ") || null;
