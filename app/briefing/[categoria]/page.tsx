import BriefingForm from "@/components/kbos/BriefingForm";
import { BRIEFING_CATEGORIES } from "@/lib/kbos/briefing-forms";

export async function generateStaticParams() {
  return BRIEFING_CATEGORIES.map((c) => ({ categoria: c.id }));
}

export default function CategoriaPage() {
  return <BriefingForm />;
}
