import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { certificates, courses, enrollments, users } from "@/lib/kbos/schema";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return { title: `Certificado ${codigo.toUpperCase()} — Kayque Brito` };
}

// Página pública: valida autenticidade pelo código único.
export default async function CertificadoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  let data: { codigo: string; curso: string; aluno: string; emitidaEm: string } | null = null;
  try {
    const d = db();
    const cert = (
      await d.select().from(certificates).where(eq(certificates.codigo, codigo.trim().toUpperCase())).limit(1)
    )[0];
    if (cert) {
      const enr = (await d.select().from(enrollments).where(eq(enrollments.id, cert.enrollmentId)).limit(1))[0];
      const course = enr ? (await d.select().from(courses).where(eq(courses.id, enr.courseId)).limit(1))[0] : undefined;
      const aluno = enr ? (await d.select().from(users).where(eq(users.id, enr.userId)).limit(1))[0] : undefined;
      if (enr && course && aluno) {
        data = {
          codigo: cert.codigo,
          curso: course.titulo,
          aluno: aluno.name,
          emitidaEm: cert.emitidaEm.toISOString(),
        };
      }
    }
  } catch {
    /* sem banco: cai no notFound abaixo */
  }
  if (!data) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B0B1E] px-5 py-16 text-[#F4F1EC]">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-white/[0.03] text-center backdrop-blur">
        <div className="border-b border-white/10 bg-white/[0.03] px-8 py-6">
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Kayque Brito · KBOS</p>
          <h1 className="font-display mt-2 text-3xl font-light">Certificado verificado</h1>
        </div>
        <div className="px-8 py-8">
          <p className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-2xl text-emerald-200" aria-hidden>
            ✓
          </p>
          <p className="mt-5 text-sm font-light text-white/55">Este certificado é autêntico e foi emitido para</p>
          <p className="font-display mt-1 text-2xl">{data.aluno}</p>
          <p className="mt-1 text-sm font-light text-white/55">pela conclusão do curso</p>
          <p className="font-display mt-1 text-xl text-[#9DB8E8]">{data.curso}</p>
          <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-left">
            <div className="bg-[#0B0B1E] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Código</p>
              <p className="mt-1 font-mono text-sm tracking-[0.08em]">{data.codigo}</p>
            </div>
            <div className="bg-[#0B0B1E] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Emitido em</p>
              <p className="mt-1 text-sm">{new Date(data.emitidaEm).toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
          <Link href="/" className="mt-8 inline-block text-[12px] uppercase tracking-[0.2em] text-white/55 hover:text-white">
            ← Voltar ao site
          </Link>
        </div>
      </div>
    </main>
  );
}
