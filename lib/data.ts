export const WHATSAPP =
  "https://wa.me/5591993743109?text=Ol%C3%A1%2C%20estou%20vindo%20do%20site!";

export const NAV = [
  { label: "Sobre", href: "#sobre", index: 1 },
  { label: "Serviços", href: "#servicos", index: 2 },
  { label: "Portfólio", href: "#portfolio", index: 3 },
  { label: "Depoimentos", href: "#depoimentos", index: 6 },
  { label: "Contato", href: "#contato", index: 7 },
];

export const HERO = {
  kicker: "Escalando marcas através de design e tecnologia",
  smallA: "Tecnólogo",
  smallB: "Criativo",
  roleA: "Produtor Audiovisual &",
  roleB: "Desenvolvedor Full Stack",
  img: "/assets/hero/kayque.png",
};

export const ABOUT = {
  eyebrow: "Sobre",
  title: "Sobre",
  // diagramado com negrito/itálico em palavras-chave
  leadA: "Tecnólogo Criativo",
  leadB: "tecnologia",
  leadC: "impacto visual",
  text: "Formado em Análise e Desenvolvimento de Sistemas, integro programação, design criativo e audiovisual para entregar soluções completas e escaláveis no ambiente digital.",
  name: "Kayque Jonathan Brito",
  photos: [
    { src: "/assets/deco/ok1.webp", alt: "Bastidor — captação audiovisual" },
    { src: "/assets/deco/ok2.webp", alt: "Bastidor — direção de cena" },
    { src: "/assets/deco/ok3.webp", alt: "Bastidor — edição e color" },
    { src: "/assets/deco/ok4.webp", alt: "Bastidor — set de filmagem" },
  ],
};

export const SERVICES = [
  {
    id: "audiovisual",
    label: "Audiovisual",
    title: "Audiovisual",
    desc: "Direção, captação e edição cinematográfica para marcas que precisam de presença.",
    img: "/assets/deco/ok2.webp",
    tag: "Filmando / Fotografando",
  },
  {
    id: "dev",
    label: "Dev",
    title: "Dev",
    desc: "Sites, landing pages e sistemas web performáticos em Next.js.",
    img: "/assets/deco/21Ativo-1.webp",
    tag: "Programando",
  },
  {
    id: "branding",
    label: "Branding",
    title: "Branding",
    desc: "Identidades com conceito, agregando valor a cada detalhe.",
    img: "/assets/deco/ok4.webp",
    tag: "Criando marcas",
  },
];

export type Project = {
  slug: string;
  title: string;
  category: string;
  service: "audiovisual" | "dev" | "branding";
  description: string;
  longDescription: string;
  about: string[];
  img: string;
  gallery: string[];
  videoLabel: string;
  client: string;
  year: string;
  /** YouTube — presente só quando há vídeo real do projeto */
  videoId?: string;
  videoStart?: number;
  /** site/produto ao vivo (link externo) */
  siteUrl?: string;
};

export const PROJECTS: Project[] = [
  {
    slug: "clau-amaral",
    title: "Clau Amaral",
    category: "Produção Audiovisual",
    service: "audiovisual",
    description:
      "Vídeo institucional em Maringá/PR. Design e narrativa visual para destacar autoridade no paisagismo premium.",
    longDescription:
      "Vídeo institucional para Clau Amaral Paisagismo. Roteiro, direção de fotografia e montagem para posicionar autoridade no mercado premium.",
    about: [
      "A Clau Amaral precisava traduzir sensibilidade paisagística em autoridade de marca. Desenhamos um roteiro enxuto que alterna macro de texturas, planos abertos dos jardins e depoimento direto.",
      "Direção de fotografia com luz natural, estabilização em gimbal e color grading neutro e sofisticado. Entrega multiformato: institucional completo, cortes verticais e teasers para tráfego.",
    ],
    img: "/assets/portfolio/klau-amaral-capa-2.webp",
    gallery: [
      "/assets/portfolio/klau-amaral-capa-2.webp",
      "/assets/Clau-Amaral/01-_1_.webp",
      "/assets/Clau-Amaral/02-_1_.webp",
      "/assets/Clau-Amaral/Clau05.webp",
      "/assets/Clau-Amaral/Flor04.webp",
      "/assets/Clau-Amaral/folha03.webp",
    ],
    videoLabel: "Play — institucional",
    videoId: "KemTbySUJBE",
    client: "Clau Amaral Paisagismo",
    year: "2024",
  },
  {
    slug: "mana-fest",
    title: "Mana Fest",
    category: "Produção Audiovisual",
    service: "audiovisual",
    description:
      "9 dias em Pipa (RN). Cobertura completa unindo esporte, cultura e sustentabilidade.",
    longDescription:
      "Cobertura audiovisual completa do Mana Fest em Pipa (RN). Direção, captação, drone e edição com narrativa focada em esporte, cultura e sustentabilidade.",
    about: [
      "Nove dias de imersão em Pipa para cobrir um dos maiores eventos da região. Operação com duas câmeras, drone e áudio direto, com cronograma diário de entrega para redes.",
      "O aftermovie costura esporte, cultura local e sustentabilidade em um ritmo progressivo — do amanhecer na praia ao palco lotado à noite.",
    ],
    img: "/assets/portfolio/manafest-capa.webp",
    gallery: [
      "/assets/portfolio/manafest-capa.webp",
      "/assets/manafest/01.webp",
      "/assets/manafest/02.webp",
      "/assets/manafest/atleta-manafest-surf.webp",
      "/assets/manafest/criancas-quilombolas.webp",
      "/assets/manafest/madeiro.webp",
    ],
    videoLabel: "Play — aftermovie",
    videoId: "A1F7Z848_OY",
    client: "Mana Fest — Pipa RN",
    year: "2024",
  },
  {
    slug: "plugbra",
    title: "PlugBra",
    category: "Landing Page",
    service: "dev",
    description: "Página de vendas de aplicativo com performance 90+ e checkout integrado.",
    longDescription:
      "Landing page de alta conversão para aplicativo. Design system próprio, copy estratégica, performance 90+ no Lighthouse e integração com checkout.",
    about: [
      "A PlugBra precisava de uma página que vendesse o app em menos de 60 segundos. Estrutura em dobra única, prova social e CTA persistente.",
      "Stack Next.js com imagens otimizadas, animação leve em GSAP e formulários conectados ao checkout. Tempo de carregamento abaixo de 1.5s no 4G.",
    ],
    img: "/assets/portfolio/PLUGBRA-CAPA-1.webp",
    gallery: ["/assets/portfolio/PLUGBRA-CAPA-1.webp", "/assets/deco/21Ativo-1.webp"],
    videoLabel: "Preview — walkthrough do site",
    client: "PlugBra",
    year: "2024",
  },
  {
    slug: "super-foods",
    title: "Super Foods",
    category: "Site",
    service: "dev",
    description:
      "Há 8 anos renovando a presença digital da PSF através de parceria estratégica.",
    longDescription:
      "Parceria de 8 anos. Site institucional, catálogo e presença digital contínua para a Pará Super Foods.",
    about: [
      "Relação contínua de evolução: do primeiro institucional ao catálogo atual, cada ciclo trouxe nova camada de performance e conteúdo.",
      "Arquitetura simples para o time atualizar, SEO técnico e fotografia de produto que valoriza textura e origem.",
    ],
    img: "/assets/portfolio/parasuperfoods-capa.webp",
    gallery: ["/assets/portfolio/parasuperfoods-capa.webp", "/assets/deco/ok1.webp"],
    videoLabel: "Play — institucional",
    videoId: "CNvxRXS_BpM",
    client: "Pará Super Foods",
    year: "2018 — atual",
  },
  {
    slug: "passos-imoveis",
    title: "Passos Imóveis",
    category: "Sistema Web",
    service: "dev",
    description: "Tabela Fip dos imóveis, consulta de preço por região.",
    longDescription:
      "Sistema web com tabela de imóveis e consulta por região. Next.js + API própria, filtros avançados e painel administrativo.",
    about: [
      "O desafio era transformar planilhas dispersas em consulta instantânea por região, padrão e metragem.",
      "Interface de busca com filtros, mapa e comparativo. API própria com cache e painel para a equipe atualizar valores sem depender de dev.",
    ],
    img: "/assets/portfolio/passo-capa.webp",
    gallery: ["/assets/portfolio/passo-capa.webp", "/assets/deco/21Ativo-3.webp"],
    videoLabel: "Preview — fluxo de consulta",
    siteUrl: "https://passo.kayquebrito.com.br/",
    client: "Passos Imóveis",
    year: "2023",
  },
  {
    slug: "acai-norte-mix",
    title: "Açaí Norte Mix",
    category: "Branding",
    service: "branding",
    description: "Ressignificação de marca com conceito e valor em cada detalhe.",
    longDescription:
      "Rebranding do Açaí Norte Mix. Pesquisa, conceito, identidade e desdobramentos para embalagem, fachada e digital.",
    about: [
      "Marca amazônica que precisava subir de patamar sem perder raiz. Conceito parte do movimento do açaí — energia, origem e mistura.",
      "Logotipo, paleta, tipografia e sistema de embalagens. Desdobramento para fachada, frota e social com grid consistente.",
    ],
    img: "/assets/portfolio/acai-norte-mix-capa.webp",
    gallery: [
      "/assets/portfolio/acai-norte-mix-capa.webp",
      "/assets/acai-norte-mix/acainortemix.webp",
      "/assets/acai-norte-mix/ok.webp",
    ],
    videoLabel: "Play — institucional",
    videoId: "Wfjwc_0vml0",
    client: "Açaí Norte Mix",
    year: "2022",
  },
  {
    slug: "comitiva-yovekene",
    title: "Comitiva Yovekene",
    category: "Branding",
    service: "branding",
    description: "Identidade de marca com conceito, agregando valor a cada detalhe.",
    longDescription:
      "Branding completo: conceito, logotipo, paleta, tipografia e aplicações para a Comitiva Yovekene.",
    about: [
      "Identidade para uma comitiva que carrega tradição e estrada. Símbolo inspirado em traço rústico minimalista, com acabamento premium.",
      "Sistema completo: marca, selos, vestuário, sinalização e peças digitais para eventos e patrocinadores.",
    ],
    img: "/assets/portfolio/comitiva-yovekene-capa.webp",
    gallery: ["/assets/portfolio/comitiva-yovekene-capa.webp"],
    videoLabel: "Case — universo da marca",
    client: "Comitiva Yovekene",
    year: "2023",
  },
];

export const getProject = (slug: string) => PROJECTS.find((p) => p.slug === slug);

export const TESTIMONIALS = [
  {
    quote:
      "Conseguiu ressignificar minha marca, trazendo conceito e agregando valor a cada detalhe. Tem sido um parceiro desde antes de tudo começar, uma peça chave para chegarmos onde estamos hoje.",
    name: "Caio Leonel",
    role: "Diretor — Açaí Norte Mix",
  },
  {
    quote:
      "Um profissional excepcional, atua nos projetos dando contribuições criativas, inovadoras e efetivas. Tem como diferencial sua visão sistêmica, permitindo sempre ótimas soluções.",
    name: "Danilo Felipe",
    role: "Parceiro",
  },
  {
    quote:
      "Profissional excelente, versátil, atua em várias áreas dentro da comunicação. Já fizemos jobs maravilhosos juntos. Programação, fotografia e audiovisual.",
    name: "Amanda Moraes",
    role: "CEO Direcionare — Publicitária",
  },
];

export const PARTNERS = [
  { name: "Direcionare", img: "/assets/partners/direcionare-logo.webp" },
  { name: "Açaí Norte Mix", img: "/assets/partners/acainortemix-logo.webp" },
  { name: "Atalaia VIP", img: "/assets/partners/atalaiavip-logo.webp" },
  { name: "Inexo", img: "/assets/partners/inexo-logo.webp" },
];

export const CONTACT = {
  title: "Vamos criar algo incrível juntos?",
  text: "Estou basicamente em todos os lugares. Fique à vontade para escolher o meio de comunicação que for melhor para você.",
  cta: "Contato",
  ctaHref: WHATSAPP,
};

export const SOCIALS = [
  { name: "Instagram", href: "https://www.instagram.com/kayquebrit0/", icon: "instagram" },
  { name: "Facebook", href: "https://www.facebook.com/kayquebrit0", icon: "facebook" },
  { name: "YouTube", href: "https://www.youtube.com/@kayquebritoo", icon: "youtube" },
  { name: "Behance", href: "https://www.behance.net/kayquebrito1", icon: "behance" },
  { name: "GitHub", href: "https://github.com/kayquebritoo", icon: "github" },
];
