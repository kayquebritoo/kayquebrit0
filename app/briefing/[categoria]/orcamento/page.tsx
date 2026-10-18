import { notFound } from "next/navigation";
import BriefingForm from "@/components/kbos/BriefingForm";
import { BRIEFING_CATEGORIES } from "@/lib/kbos/briefing-forms";
import { getService } from "@/lib/kbos/services";

export const revalidate = 60;

export async function generateStaticParams() {
  return BRIEFING_CATEGORIES.map((c) => ({ categoria: c.id }));
}

export default async function OrcamentoPage({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const s = await getService(categoria);
  if (!s || !s.active) notFound();
  return <BriefingForm service={{ label: s.label, baseValue: s.baseValue, term: s.term }} />;
}
