import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { timeEntries } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, readBody, timeSchema } from "@/lib/kbos/validators";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET ?projectId= — entradas + total de segundos (dono ou equipe).
export async function GET(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId obrigatório." }, { status: 400 });
  const bad = checkId(projectId);
  if (bad) return bad;
  const rows = await db()
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.projectId, projectId))
    .orderBy(desc(timeEntries.inicio))
    .limit(200);
  const total = rows.reduce((a, r) => a + (r.segundos ?? 0), 0);
  const aberta = rows.find((r) => !r.fim) || null;
  return NextResponse.json({ items: rows, totalSegundos: total, aberta });
}

// POST { action: "start" | "stop", projectId, taskId? } — time tracking.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, timeSchema);
    if ("error" in parsed) return parsed.error;
    const { action, projectId, taskId } = parsed.data;
    const d = db();
    if (action === "start") {
      const open = (
        await d
          .select()
          .from(timeEntries)
          .where(and(eq(timeEntries.userId, user!.id), isNull(timeEntries.fim)))
          .limit(1)
      )[0];
      if (open) return NextResponse.json({ error: "Já existe um timer aberto.", entry: open }, { status: 409 });
      const rows = await d
        .insert(timeEntries)
        .values({ projectId, taskId: taskId || null, userId: user!.id })
        .returning();
      return NextResponse.json({ ok: true, entry: rows[0] }, { status: 201 });
    }
    if (action === "stop") {
      const open = (
        await d
          .select()
          .from(timeEntries)
          .where(and(eq(timeEntries.userId, user!.id), isNull(timeEntries.fim)))
          .limit(1)
      )[0];
      if (!open) return NextResponse.json({ error: "Nenhum timer aberto." }, { status: 404 });
      const fim = new Date();
      const segundos = Math.max(0, Math.round((fim.getTime() - new Date(open.inicio).getTime()) / 1000));
      await d.update(timeEntries).set({ fim, segundos }).where(eq(timeEntries.id, open.id));
      return NextResponse.json({ ok: true, segundos });
    }
    return NextResponse.json({ error: "action inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
