// Clientes que têm várias empresas/marcas e um mesmo acervo no Lume.
// O atalho de cada empresa abre o Lume já filtrado pela pasta (nome presente no caminho dos arquivos).
export type HubCompany = { key: string; label: string; pasta: string };
export type ClientHub = { id: string; label: string; match: RegExp; pasta: string; empresas: HubCompany[] };

export const CLIENT_HUBS: ClientHub[] = [
  {
    id: "grupo-vip",
    label: "Grupo VIP",
    match: /atalaia|grupo\s*vip|\bvip\b/i,
    pasta: "Atalaia",
    empresas: [
      { key: "hotel", label: "Hotel", pasta: "Hotel" },
      { key: "lounge", label: "Lounge", pasta: "Lounge" },
      { key: "praca", label: "Praça", pasta: "Praça" },
    ],
  },
];

/** Hub do cliente pelo nome do contato ou da empresa; `null` quando o cliente não tem hub. */
export function hubFor(...names: (string | null | undefined)[]): ClientHub | null {
  const text = names.filter(Boolean).join(" ");
  return text ? CLIENT_HUBS.find((h) => h.match.test(text)) ?? null : null;
}

/** Link do KBOS que abre o Lume já autenticado (e filtrado, se `pasta`). */
export const lumeHref = (pasta?: string) => `/api/admin/lume/entrar${pasta ? `?pasta=${encodeURIComponent(pasta)}` : ""}`;
