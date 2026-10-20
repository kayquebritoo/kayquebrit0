// Cor de cada empresa do Grupo Atalaia VIP no calendário (admin e portal). Só para distinguir marcas;
// o estágio do post continua com as cores de status. Hotel azul-mar, Lounge dourado, Praça laranja.
export const BRAND_COLORS: Record<string, string> = { Hotel: "#3BA6FF", Lounge: "#E8B93A", Praça: "#FF6A2B" };
export const BRAND_LIST = Object.keys(BRAND_COLORS);
export const brandColor = (brand: string | null | undefined): string | null => (brand ? BRAND_COLORS[brand] ?? null : null);
