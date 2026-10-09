import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { courses } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { courseCreateSchema, readBody } from "@/lib/kbos/validators";
import { isConflict, uniqueSlug } from "@/lib/kbos/lms";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET: catálogo público (só publicados); equipe vê tudo.
export async function GET() {
  try {
    const user = await sessionUser().catch(() => null);
    const staff = !!user && (STAFF as readonly string[]).includes(user.role);
    const rows = staff
      ? await db().select().from(courses).orderBy(desc(courses.updatedAt)).limit(100)
      : await db()
          .select()
          .from(courses)
          .where(eq(courses.status, "publicado"))
          .orderBy(desc(courses.updatedAt))
          .limit(100);
    return NextResponse.json({ items: rows.map(strip) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

function strip(c: typeof courses.$inferSelect) {
  const { ...rest } = c;
  return rest;
}

// POST: cria curso (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, courseCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    const slug = b.slug ?? (await uniqueSlug(b.titulo));
    try {
      const rows = await db()
        .insert(courses)
        .values({
          titulo: b.titulo,
          slug,
          descricao: b.descricao ?? null,
          preco: b.preco ?? null,
          capa: b.capa ?? null,
          status: b.status ?? "rascunho",
        })
        .returning();
      return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
    } catch (e) {
      if (isConflict(e)) return NextResponse.json({ error: "Slug já em uso." }, { status: 409 });
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
