import Fullpage from "@/components/Fullpage";
import HeroSlide from "@/components/HeroSlider";
import {
  AboutSlide,
  ServicesSlide,
  AudiovisualSlide,
  DevSlide,
  BrandingSlide,
  TestimonialsSlide,
  ContactSlide,
} from "@/components/Sections";

// Fluxo espelhado de kayquebrito.com.br (8 slides, snap sessão-a-sessão
// com as mesmas transições GSAP no mobile e no desktop):
// 1 Hero · 2 Sobre · 3 Serviços · 4 Audiovisual · 5 Dev · 6 Branding · 7 Depoimentos · 8 Contato
const SLIDES = [
  { id: "topo", label: "Início" },
  { id: "sobre", label: "Sobre" },
  { id: "servicos", label: "Serviços" },
  { id: "audiovisual", label: "Audiovisual" },
  { id: "dev", label: "Dev" },
  { id: "branding", label: "Branding" },
  { id: "depoimentos", label: "Depoimentos" },
  { id: "contato", label: "Contato" },
];

export const SLIDE_INDEX = {
  topo: 0,
  sobre: 1,
  servicos: 2,
  audiovisual: 3,
  dev: 4,
  branding: 5,
  depoimentos: 6,
  contato: 7,
} as const;

export default function Home() {
  return (
    <main className="bg-[#0B0B1E] text-[#F4F1EC]">
      <Fullpage slides={SLIDES}>
        <HeroSlide />
        <AboutSlide />
        <ServicesSlide />
        <AudiovisualSlide />
        <DevSlide />
        <BrandingSlide />
        <TestimonialsSlide />
        <ContactSlide />
      </Fullpage>
    </main>
  );
}
