import type { MetadataRoute } from "next";
import { listPublicCases } from "@/lib/kbos/showcase";

// Os cases publicados entram no mapa do site; renova a cada hora.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://kayquebrito.com.br";
  const cases = await listPublicCases();
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/trabalho`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    ...cases.map((p) => ({
      url: `${base}/trabalho/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
