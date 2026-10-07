// Catálogos de briefing por categoria. O form renderer (`/briefing/[categoria]/orcamento`)
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
  /** copy rica da página de categoria */
  tagline: string;
  pitch: string[];
  bullets: string[];
  process: { title: string; desc: string }[];
  cover: string;
  /** para puxar portfolio relacionado em lib/data.ts */
  portfolioService: ("audiovisual" | "dev" | "branding")[];
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
    tagline: "Luz, direção e verdade em cada clique.",
    pitch: [
      "Fotografo marcas e pessoas com direção leve e olhar cinematográfico — do ensaio individual ao evento corporativo cheio.",
      "Você recebe curadoria + tratamento fino cor a cor, galeria online pronta para postar e arquivos em alta para impressão.",
    ],
    bullets: ["Direção de poses leve", "Tratamento premium", "Galeria online + alta resolução", "Prévia em 48h"],
    process: [
      { title: "Conversa", desc: "Entendo objetivo, local, luz e referências." },
      { title: "Direção", desc: "Roteiro de poses e cronograma no dia." },
      { title: "Entrega", desc: "Curadoria, tratamento e galeria pronta." },
    ],
    cover: "/assets/manafest/01.webp",
    portfolioService: ["audiovisual"],
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
    tagline: "Cinema que vende — do roteiro ao corte final.",
    pitch: [
      "Do institucional ao aftermovie: roteiro, direção, captação com drone e gimbal, áudio direto e color cinematográfico.",
      "Entrego versões horizontal + vertical, legendadas e otimizadas para anúncios — prontas para escalar sua marca.",
    ],
    bullets: ["Roteiro + direção", "Drone e gimbal 4K", "Color cinematográfico", "Versões YT + reels"],
    process: [
      { title: "Roteiro", desc: "Conceito, plano de captação e cronograma." },
      { title: "Set", desc: "Captação com direção leve e eficiente." },
      { title: "Final", desc: "Montagem, color, trilha e masters." },
    ],
    cover: "/assets/portfolio/manafest-capa.webp",
    portfolioService: ["audiovisual"],
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
    tagline: "Sites rápidos que viram orçamento no WhatsApp.",
    pitch: [
      "Sites institucionais e landing pages em Next.js com performance 90+ e design que guia o visitante até o CTA.",
      "Copy estratégica, SEO técnico, animações GSAP leves e integração com WhatsApp, checkout e CRM.",
    ],
    bullets: ["Next.js ultrarrápido", "Copy + SEO inclusos", "Animações premium", "Integração WhatsApp"],
    process: [
      { title: "Mapa", desc: "Sitemap, copy e referências visuais." },
      { title: "Build", desc: "Design + código com previews semanais." },
      { title: "Go-live", desc: "Deploy, domínio, analytics e treino." },
    ],
    cover: "/assets/portfolio/PLUGBRA-CAPA-1.webp",
    portfolioService: ["dev"],
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
    tagline: "Sistema sob medida, sem gambiarra.",
    pitch: [
      "Aplicativos e painéis web que resolvem operação real: login, pagamentos, agenda, mapas e integrações.",
      "Arquitetura escalável, painel admin simples para sua equipe e suporte pós-entrega.",
    ],
    bullets: ["Escopo fechado", "Painel admin simples", "API + integrações", "Suporte pós-go"],
    process: [
      { title: "Descoberta", desc: "Fluxos, regras e protótipo navegável." },
      { title: "Sprints", desc: "Entregas semanais testáveis." },
      { title: "Escala", desc: "Deploy, monitoramento e evolução." },
    ],
    cover: "/assets/portfolio/passo-capa.webp",
    portfolioService: ["dev"],
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
    tagline: "Sua vitrine vendendo no automático.",
    pitch: [
      "E-commerce completo: catálogo, checkout Pix + cartão, frete, cupons e painel para você gerenciar tudo sozinho.",
      "Foco em conversão mobile — onde 80% das suas vendas acontecem.",
    ],
    bullets: ["Checkout Pix + cartão", "Frete e cupons", "Painel simples", "Pixel + analytics"],
    process: [
      { title: "Catálogo", desc: "Produtos, fotos e precificação." },
      { title: "Loja", desc: "Layout, checkout e testes reais." },
      { title: "Vendas", desc: "Treino, tráfego e evolução." },
    ],
    cover: "/assets/portfolio/parasuperfoods-capa.webp",
    portfolioService: ["dev"],
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
    tagline: "Marca com conceito — não só um logo bonito.",
    pitch: [
      "Identidades com pesquisa, conceito e sistema completo: logo, paleta, tipografia, embalagem e aplicações reais.",
      "Você sai com manual, arquivos abertos e peças prontas para fachada, social e impressão.",
    ],
    bullets: ["Conceito + moodboard", "Logo + sistema visual", "Manual da marca", "Peças de lançamento"],
    process: [
      { title: "Imersão", desc: "Pesquisa, concorrentes e posicionamento." },
      { title: "Criação", desc: "Rotas criativas até a marca final." },
      { title: "Sistema", desc: "Desdobramentos + manual + entrega." },
    ],
    cover: "/assets/portfolio/acai-norte-mix-capa.webp",
    portfolioService: ["branding"],
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
