import { KbosShell } from "@/components/kbos/Shell";
import StudentCourses from "@/components/kbos/StudentCourses";

export const metadata = { title: "Meus Cursos — KBOS" };

export default function PortalCursosPage() {
  return (
    <KbosShell title="Meus Cursos">
      <StudentCourses />
    </KbosShell>
  );
}
