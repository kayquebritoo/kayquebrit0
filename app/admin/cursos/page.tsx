import { KbosShell } from "@/components/kbos/Shell";
import AdminCourses from "@/components/kbos/AdminCourses";

export const metadata = { title: "Cursos — KBOS Admin" };

export default function AdminCursosPage() {
  return (
    <KbosShell title="Cursos" admin>
      <AdminCourses />
    </KbosShell>
  );
}
