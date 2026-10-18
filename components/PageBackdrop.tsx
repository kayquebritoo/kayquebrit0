import { PanelWaves } from "@/components/HeroSlider";

/* Fundo das páginas internas do site: aurora roxa suave + ondas discretas.
   Substitui os brilhos rosa chapados; o rosa só aparece no fim do degradê. */
export default function PageBackdrop() {
  return (
    <div aria-hidden className="page-aurora">
      <div className="page-waves">
        <PanelWaves subtle />
      </div>
    </div>
  );
}
