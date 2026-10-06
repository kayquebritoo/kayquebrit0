import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { MobileCta, SlideProgress } from "@/components/MobileChrome";
import { Grain } from "@/components/fx";

const manrope = Manrope({ subsets: ["latin"], weight: ["300", "400", "500", "700"] });

const SITE_URL = "https://kayquebrito.com.br";
const SITE_DESC =
  "Kayque Jonathan Brito — Tecnólogo Criativo, Produtor Audiovisual & Desenvolvedor Full Stack. Escalando marcas através de design e tecnologia.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Kayque Brito — Desenvolvedor Digital",
    template: "%s — Kayque Brito",
  },
  description: SITE_DESC,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Kayque Brito — Desenvolvedor Digital",
    description: SITE_DESC,
    url: "/",
    siteName: "Kayque Brito",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/assets/portfolio/manafest-capa.webp",
        width: 1600,
        height: 993,
        alt: "Kayque Brito — Portfólio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kayque Brito — Desenvolvedor Digital",
    description: SITE_DESC,
    images: ["/assets/portfolio/manafest-capa.webp"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0B1E",
  viewportFit: "cover",
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Kayque Brito",
  description: SITE_DESC,
  url: SITE_URL,
  areaServed: "Brasil",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Belém",
    addressRegion: "PA",
    addressCountry: "BR",
  },
  founder: {
    "@type": "Person",
    name: "Kayque Jonathan Brito",
    jobTitle: "Tecnólogo Criativo",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className={`${manrope.className} min-h-full flex flex-col bg-[#0B0B1E] text-[#F4F1EC]`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <Header />
        {children}
        <SlideProgress />
        <MobileCta />
        <Grain />
      </body>
    </html>
  );
}
