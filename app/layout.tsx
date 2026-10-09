import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Header from "@/components/Header";
import { SlideProgress } from "@/components/MobileChrome";
import { Providers } from "@/components/Providers";
import { Grain } from "@/components/fx";

// Manrope auto-hospedada (latin) — build determinístico, sem depender
// de fonts.googleapis.com no momento do build.
const manrope = localFont({
  src: [
    { path: "../public/fonts/manrope-300.woff2", weight: "300" },
    { path: "../public/fonts/manrope-400.woff2", weight: "400" },
    { path: "../public/fonts/manrope-500.woff2", weight: "500" },
    { path: "../public/fonts/manrope-700.woff2", weight: "700" },
  ],
  display: "swap",
});

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
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
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
        <Providers>
          <Header />
          {children}
          <SlideProgress />
        </Providers>
        <Grain />
      </body>
    </html>
  );
}
