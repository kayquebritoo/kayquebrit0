// Catálogos de briefing por categoria. O form renderer (`/briefing/[categoria]`)
// monta os campos daqui — adicionar categoria = adicionar entrada.
export type FieldType = "text" | "textarea" | "select" | "date" | "tel" | "email" | "number";

export type BriefingField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type BriefingCategory = {
  id: string;
  label: string;
  desc: string;
  baseValue: string;
  fields: BriefingField[];
};

const CONTATO: BriefingField[] = [
  { name: "nome", label: "Nome completo / empresa", type: "text", required: true },
  { name: "email", label: "E-mail", type: "email", required: true },
  { name: "telefone", label: "WhatsApp", type: "tel", required: true, placeholder: "(91) 99999-9999" },
];

const PRAZO_ORCAMENTO: BriefingField[] = [
  { name: "prazo", label: "Prazo ideal", type: "date", required: true },
  { name: "orcamento", label: "Faixa de investimento (R$)", type: "select", required: true,
    options: ["até 2.000", "2.000 – 5.000", "5.000 – 15.000", "15.000 – 30.000", "acima de 30.000"] },
  { name: "referencias", label: "Referências (links ou descrição)", type: "textarea" },
];

export const BRIEFING_CATEGORIES: BriefingCategory[] = [
  {
    id: "fotografia",
    label: "Fotografia",
    desc: "Ensaios, eventos, produto e corporativo.",
    baseValue: "a partir de R$ 800",
    fields: [
      ...CONTATO,
      { name: "tipo_ensaio", label: "Tipo de ensaio", type: "select", required: true,
        options: ["Evento", "Ensaio individual/casal", "Produto", "Corporativo", "Outro"] },
      { name: "data_evento", label: "Data do evento/ensaio", type: "date", required: true },
      { name: "local", label: "Local (cidade + endereço)", type: "text", required: true },
      { name: "duracao", label: "Duração estimada (horas)", type: "number", required: true },
      { name: "entregaveis", label: "O que espera receber?", type: "textarea",
        placeholder: "Ex.: 50 fotos tratadas + álbum impresso..." },
      ...PRAZO_ORCAMENTO,
    ],
  },
  {
    id: "video",
    label: "Vídeo",
    desc: "Institucional, cobertura de eventos e reels.",
    baseValue: "a partir de R$ 1.500",
    fields: [
      ...CONTATO,
      { name: "tipo_video", label: "Tipo de vídeo", type: "select", required: true,
        options: ["Institucional", "Cobertura de evento", "Comercial/anúncio", "Reels/shorts", "Aftermovie"] },
      { name: "data_gravacao", label: "Data da gravação", type: "date", required: true },
      { name: "local", label: "Local da gravação", type: "text", required: true },
      { name: "duracao_final", label: "Duração final desejada", type: "select", required: true,
        options: ["até 1 min", "1 – 3 min", "3 – 10 min", "acima de 10 min"] },
      { name: "roteiro", label: "Já tem roteiro ou ideia?", type: "textarea" },
      { name: "formatos", label: "Formatos de entrega", type: "select",
        options: ["Horizontal (YouTube)", "Vertical (reels)", "Ambos"] },
      ...PRAZO_ORCAMENTO,
    ],
  },
  {
    id: "sites",
    label: "Sites",
    desc: "Institucionais, landing pages e portfólios.",
    baseValue: "a partir de R$ 2.500",
    fields: [
      ...CONTATO,
      { name: "tipo_site", label: "Tipo de site", type: "select", required: true,
        options: ["Institucional", "Landing page", "Portfólio", "Blog/conteúdo"] },
      { name: "paginas", label: "Páginas/seções previstas", type: "textarea", required: true,
        placeholder: "Ex.: home, sobre, serviços, contato..." },
      { name: "conteudo_pronto", label: "Textos e fotos já estão prontos?", type: "select", required: true,
        options: ["Sim, tudo pronto", "Parcialmente", "Não, preciso de ajuda"] },
      { name: "dominio", label: "Já tem domínio?", type: "text", placeholder: "Ex.: minhaempresa.com.br" },
      { name: "objetivo", label: "Objetivo principal do site", type: "textarea", required: true,
        placeholder: "Ex.: captar orçamentos pelo WhatsApp..." },
      ...PRAZO_ORCAMENTO,
    ],
  },
  {
    id: "apps",
    label: "Apps & Sistemas",
    desc: "Aplicativos e sistemas web sob medida.",
    baseValue: "a partir de R$ 8.000",
    fields: [
      ...CONTATO,
      { name: "tipo_app", label: "O que precisa?", type: "select", required: true,
        options: ["Aplicativo mobile", "Sistema web", "Painel administrativo", "Integração/API"] },
      { name: "plataformas", label: "Plataformas", type: "select",
        options: ["Android + iOS", "Somente Android", "Somente iOS", "Web"] },
      { name: "funcionalidades", label: "Funcionalidades essenciais", type: "textarea", required: true,
        placeholder: "Ex.: login, pagamento, agenda, notificações..." },
      { name: "usuarios", label: "Quantos usuários espera atender?", type: "select",
        options: ["até 100", "100 – 1.000", "1.000 – 10.000", "acima de 10.000"] },
      ...PRAZO_ORCAMENTO,
    ],
  },
  {
    id: "lojas",
    label: "Lojas Virtuais",
    desc: "E-commerce completo para vender online.",
    baseValue: "a partir de R$ 4.000",
    fields: [
      ...CONTATO,
      { name: "produtos", label: "Quantos produtos?", type: "select", required: true,
        options: ["até 20", "20 – 100", "100 – 500", "acima de 500"] },
      { name: "pagamento", label: "Meios de pagamento", type: "select",
        options: ["Pix + cartão", "Somente Pix", "Boleto incluso", "Ainda não sei"] },
      { name: "entrega", label: "Como funciona a entrega?", type: "textarea",
        placeholder: "Ex.: Correios, motoboy local, digital..." },
      { name: "plataforma_atual", label: "Já vende em alguma plataforma?", type: "text",
        placeholder: "Ex.: Instagram, Mercado Livre, nenhuma" },
      ...PRAZO_ORCAMENTO,
    ],
  },
  {
    id: "design",
    label: "Design & Branding",
    desc: "Identidade visual, logo e peças.",
    baseValue: "a partir de R$ 1.200",
    fields: [
      ...CONTATO,
      { name: "tipo_design", label: "O que precisa?", type: "select", required: true,
        options: ["Logo + identidade", "Rebranding", "Peças p/ redes sociais", "Embalagem", "Manual da marca"] },
      { name: "segmento", label: "Segmento da marca", type: "text", required: true },
      { name: "personalidade", label: "Personalidade desejada (3 palavras)", type: "text",
        placeholder: "Ex.: moderna, ousada, premium" },
      { name: "cores", label: "Cores de preferência ou a evitar", type: "text" },
      ...PRAZO_ORCAMENTO,
    ],
  },
];

export function getCategory(id: string) {
  return BRIEFING_CATEGORIES.find((c) => c.id === id);
}
