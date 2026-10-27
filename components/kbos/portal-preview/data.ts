// Dados FICTÍCIOS do protótipo do portal (/portal/preview). Nada aqui vem do banco nem é gravado.

export type Swatch = { name: string; hex: string; use: string };
export type Brand = {
  name: string;
  monogram: string;
  tagline: string;
  purpose: string;
  mission: string;
  vision: string;
  values: string[];
  colors: Swatch[];
  type: { display: string; body: string; note: string };
  logos: { name: string; bg: string; fg: string; formats: string[] }[];
  applications: { name: string; tone: [string, string] }[];
};
export type Channel = "instagram" | "facebook" | "tiktok" | "youtube" | "google";
export type ChannelStatus = "publicado" | "agendado" | "pendente" | "erro";
export type Content = {
  id: string;
  title: string;
  format: string;
  date: string; // AAAA-MM-DD
  company: string;
  stage: "planejado" | "producao" | "aprovacao" | "ajustes" | "aprovado" | "publicado";
  caption: string;
  channels: { network: Channel; status: ChannelStatus }[];
};
export type Company = { id: string; name: string; color: string; brand: Brand };
export type Step = { label: string; done: boolean; current?: boolean; date: string };
export type Revision = { round: string; title: string; status: "aprovada" | "ajustes" | "aguardando"; date: string; note?: string; by?: string };
export type FileGroup = { label: string; items: { name: string; size: string; kind: string }[] };

export type Scenario = {
  id: "marca" | "recorrente";
  label: string;
  person: string;
  companies: Company[];
  steps?: Step[];
  revisions?: Revision[];
  contents?: Content[];
  files: FileGroup[];
};

const ipe: Brand = {
  name: "Studio Ipê",
  monogram: "Ip",
  tagline: "Móveis que florescem com o tempo.",
  purpose: "Fazer cada casa contar a história de quem vive nela.",
  mission: "Desenhar e produzir móveis de madeira certificada, feitos à mão em Belém, para durar gerações.",
  vision: "Ser a marca de mobiliário autoral mais lembrada da Amazônia até 2030.",
  values: ["Feito para durar", "Madeira com origem", "Desenho com afeto", "Transparência no prazo"],
  colors: [
    { name: "Ipê Amarelo", hex: "#E9B949", use: "Destaques e chamadas" },
    { name: "Mata", hex: "#1F3B2D", use: "Fundos e textos fortes" },
    { name: "Linho", hex: "#F4EFE6", use: "Respiro e papelaria" },
    { name: "Barro", hex: "#C8553D", use: "Detalhes e ícones" },
  ],
  type: { display: "Fraunces", body: "Inter", note: "Títulos em Fraunces (peso 600). Textos corridos em Inter 16 px, entrelinha 1,5." },
  logos: [
    { name: "Principal", bg: "#1F3B2D", fg: "#E9B949", formats: ["SVG", "PNG", "PDF"] },
    { name: "Negativo", bg: "#F4EFE6", fg: "#1F3B2D", formats: ["SVG", "PNG"] },
    { name: "Símbolo", bg: "#E9B949", fg: "#1F3B2D", formats: ["SVG", "PNG", "ICO"] },
  ],
  applications: [
    { name: "Etiqueta de produto", tone: ["#1F3B2D", "#2E5A43"] },
    { name: "Fachada da loja", tone: ["#C8553D", "#E9B949"] },
    { name: "Post de lançamento", tone: ["#E9B949", "#F4EFE6"] },
    { name: "Cartão de visita", tone: ["#F4EFE6", "#d9cfbd"] },
  ],
};

const vipBrand = (name: string, monogram: string, tagline: string, main: string, accent: string): Brand => ({
  name,
  monogram,
  tagline,
  purpose: "Receber cada pessoa como se fosse da família, à beira do rio.",
  mission: "Oferecer hospedagem, gastronomia e lazer com conforto e atendimento caloroso.",
  vision: "Ser o destino de fim de semana preferido de Belém e região.",
  values: ["Acolhimento", "Qualidade", "Alegria", "Respeito ao rio"],
  colors: [
    { name: "Principal", hex: main, use: "Logo e títulos" },
    { name: "Acento", hex: accent, use: "Chamadas e preços" },
    { name: "Areia", hex: "#F2E8D5", use: "Fundos claros" },
    { name: "Noite", hex: "#14121F", use: "Fundos escuros" },
  ],
  type: { display: "Montserrat", body: "Open Sans", note: "Exemplo de demonstração: a tipografia real vem do manual de cada empresa." },
  logos: [
    { name: "Principal", bg: main, fg: "#ffffff", formats: ["SVG", "PNG", "PDF"] },
    { name: "Negativo", bg: "#F2E8D5", fg: main, formats: ["SVG", "PNG"] },
  ],
  applications: [
    { name: "Cardápio", tone: [main, accent] },
    { name: "Story de evento", tone: [accent, "#F2E8D5"] },
    { name: "Fachada", tone: ["#14121F", main] },
  ],
});

export const SCENARIOS: Scenario[] = [
  {
    id: "marca",
    label: "Identidade visual",
    person: "Marina",
    companies: [{ id: "ipe", name: "Studio Ipê", color: "#E9B949", brand: ipe }],
    steps: [
      { label: "Briefing", done: true, date: "02/10" },
      { label: "Conceito", done: true, date: "09/10" },
      { label: "Criação", done: false, current: true, date: "30/10" },
      { label: "Manual", done: false, date: "06/11" },
      { label: "Entrega", done: false, date: "10/11" },
    ],
    revisions: [
      { round: "Rodada 3", title: "Logo principal — versão refinada", status: "aguardando", date: "27/10" },
      { round: "Rodada 2", title: "Paleta e tipografia", status: "aprovada", date: "20/10", note: "Amei o amarelo mais quente.", by: "Marina" },
      { round: "Rodada 1", title: "Três caminhos de conceito", status: "ajustes", date: "13/10", note: "Seguir pelo caminho 2, com menos ornamento.", by: "Marina" },
    ],
    files: [
      { label: "Logotipos", items: [{ name: "ipe-logo-principal.svg", size: "18 KB", kind: "SVG" }, { name: "ipe-logo-principal.png", size: "240 KB", kind: "PNG" }, { name: "ipe-simbolo.svg", size: "6 KB", kind: "SVG" }] },
      { label: "Manual e apresentação", items: [{ name: "manual-studio-ipe.pdf", size: "8,2 MB", kind: "PDF" }, { name: "apresentacao-conceito.pdf", size: "5,1 MB", kind: "PDF" }] },
      { label: "Fontes", items: [{ name: "Fraunces.zip", size: "1,4 MB", kind: "ZIP" }] },
    ],
  },
  {
    id: "recorrente",
    label: "Marketing recorrente",
    person: "Thalita",
    companies: [
      { id: "hotel", name: "Hotel Atalaia VIP", color: "#3BA6FF", brand: vipBrand("Hotel Atalaia VIP", "H", "Seu refúgio à beira do rio.", "#1C5D99", "#3BA6FF") },
      { id: "lounge", name: "Atalaia VIP Lounge", color: "#E8B93A", brand: vipBrand("Atalaia VIP Lounge", "L", "Noites que viram história.", "#3A2A0E", "#E8B93A") },
      { id: "praca", name: "Praça de Alimentação", color: "#FF6A2B", brand: vipBrand("Praça de Alimentação Atalaia VIP", "P", "Sabor de fim de semana, todo dia.", "#8C2F0E", "#FF6A2B") },
    ],
    contents: [
      { id: "c1", title: "Chapa de camarão — reels", format: "Vídeo (Reels)", date: "2026-10-28", company: "praca", stage: "aprovacao", caption: "Sexta tem chapa de camarão pra dividir com a galera. Bora?", channels: [{ network: "instagram", status: "pendente" }, { network: "facebook", status: "pendente" }, { network: "tiktok", status: "pendente" }] },
      { id: "c2", title: "Pacote feriadão de novembro", format: "Carrossel", date: "2026-10-29", company: "hotel", stage: "aprovacao", caption: "Feriadão chegando: quarto com café da manhã e piscina liberada.", channels: [{ network: "instagram", status: "pendente" }, { network: "facebook", status: "pendente" }] },
      { id: "c3", title: "Noite do samba", format: "Post estático", date: "2026-10-25", company: "lounge", stage: "publicado", caption: "Sábado é dia de samba no Lounge.", channels: [{ network: "instagram", status: "publicado" }, { network: "facebook", status: "publicado" }, { network: "google", status: "erro" }] },
      { id: "c4", title: "Bastidores da cozinha", format: "Vídeo (Reels)", date: "2026-10-31", company: "praca", stage: "producao", caption: "", channels: [{ network: "instagram", status: "pendente" }, { network: "tiktok", status: "pendente" }] },
      { id: "c5", title: "Café da manhã regional", format: "Carrossel", date: "2026-10-22", company: "hotel", stage: "publicado", caption: "Tapioca, açaí e café coado: bom dia do jeito paraense.", channels: [{ network: "instagram", status: "publicado" }, { network: "facebook", status: "agendado" }] },
      { id: "c6", title: "Happy hour com DJ", format: "Story", date: "2026-11-01", company: "lounge", stage: "planejado", caption: "", channels: [{ network: "instagram", status: "pendente" }] },
    ],
    files: [
      { label: "Fotos do mês (Lume)", items: [{ name: "praca-chapa-camarao-01.jpg", size: "4,8 MB", kind: "JPG" }, { name: "hotel-piscina-drone.mp4", size: "212 MB", kind: "MP4" }, { name: "lounge-samba-palco.jpg", size: "5,1 MB", kind: "JPG" }] },
      { label: "Relatórios", items: [{ name: "relatorio-setembro-2026.pdf", size: "1,2 MB", kind: "PDF" }] },
    ],
  },
];

export const NETWORK_LABEL: Record<Channel, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", google: "Google" };
export const STAGE_LABEL: Record<Content["stage"], string> = { planejado: "Planejado", producao: "Em produção", aprovacao: "Aguardando você", ajustes: "Ajustes pedidos", aprovado: "Aprovado", publicado: "Publicado" };
export const CHANNEL_LABEL: Record<ChannelStatus, string> = { publicado: "Publicado", agendado: "Agendado", pendente: "Aguardando", erro: "Falhou" };
