import type { MetadataRoute } from "next";
import { PROJECTS } from "@/lib/data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://kayquebrito.com.br";
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/trabalho`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    ...PROJECTS.map((p) => ({
      url: `${base}/trabalho/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
