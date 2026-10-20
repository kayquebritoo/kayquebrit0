import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { importPosts, previewImport } from "@/lib/kbos/social-posts";

export const dynamic = "force-dynamic";
const body = z.object({ projectId: z.string().uuid(), text: z.string().min(20).max(6_000_000), dryRun: z.boolean().optional() });

// POST /api/admin/social/import — lê o .ics do mLabs. dryRun só conta; sem dryRun grava o que é novo.
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const { projectId, text, dryRun } = parsed.data;
    if (dryRun) {
      const p = await previewImport(projectId, text);
      if (p.parsed.length === 0) return NextResponse.json({ error: "Não encontrei posts nesse arquivo. Use o .ics exportado do calendário do mLabs." }, { status: 400 });
      return NextResponse.json({ total: p.parsed.length, fresh: p.fresh.length, existing: p.existing, sample: p.fresh.slice(0, 8).map((x) => ({ title: x.title, brand: x.brand, format: x.format, scheduledAt: x.scheduledAt, status: x.status })) });
    }
    return NextResponse.json({ ok: true, ...(await importPosts(projectId, text)) });
  } catch (e) {
    if (e instanceof Error && /não encontrado/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 404 });
    return serverError(e);
  }
}
