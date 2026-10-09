import Link from "next/link";
import { KbosShell } from "@/components/kbos/Shell";
import AdminCourseDetail from "@/components/kbos/AdminCourseDetail";

export const metadata = { title: "Editar curso — KBOS Admin" };

export default async function AdminCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <KbosShell title="Editar curso" admin>
      <Link href="/admin/cursos" className="text-[11px] uppercase tracking-[0.3em] text-white/45 hover:text-white">
        ← Cursos
      </Link>
      <div className="mt-5">
        <AdminCourseDetail courseId={id} />
      </div>
    </KbosShell>
  );
}
