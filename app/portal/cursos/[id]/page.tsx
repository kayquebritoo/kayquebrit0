import Link from "next/link";
import { KbosShell } from "@/components/kbos/Shell";
import CoursePlayer from "@/components/kbos/CoursePlayer";

export const metadata = { title: "Assistir — KBOS" };

export default async function PortalCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <KbosShell title="Sala de aula">
      <Link href="/portal/cursos" className="text-[11px] uppercase tracking-[0.3em] text-white/45 hover:text-white">
        ← Meus cursos
      </Link>
      <div className="mt-5">
        <CoursePlayer courseId={id} />
      </div>
    </KbosShell>
  );
}
