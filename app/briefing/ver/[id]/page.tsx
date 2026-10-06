import BriefingView from "@/components/kbos/BriefingView";

// IDs de briefing só existem em runtime. No export estático geramos uma rota
// placeholder (nunca linkada); na Vercel os ids reais resolvem dinamicamente.
export async function generateStaticParams() {
  return [{ id: "__placeholder__" }];
}

export default function VerBriefingPage() {
  return <BriefingView />;
}
