// Lista única de serviços: as 3 frentes do KBOS (Imagem, Marca, Código).
// Junta as três listas antigas (briefing, plano de venda e portfólio) sem
// mudar os dados gravados: qualquer categoria conhecida cai numa frente.
export const FRONTS = ["imagem", "marca", "codigo"] as const;
export type Front = (typeof FRONTS)[number];
export const FRONT_LABEL: Record<Front, string> = { imagem: "Imagem", marca: "Marca", codigo: "Código" };

const MAP: Record<string, Front> = {
  fotografia: "imagem", foto: "imagem", video: "imagem", audiovisual: "imagem",
  design: "marca", branding: "marca", marca: "marca",
  sites: "codigo", site: "codigo", apps: "codigo", app: "codigo", lojas: "codigo", loja: "codigo", dev: "codigo", codigo: "codigo",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** "mensal" é modelo de cobrança, não serviço: fica sem frente (null). */
export function frontOf(categoria: string | null | undefined): Front | null {
  if (!categoria) return null;
  return MAP[norm(categoria)] ?? null;
}
