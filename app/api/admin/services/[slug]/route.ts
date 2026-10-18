import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { readBody, normalizeMoney } from "@/lib/kbos/validators";
import { BRIEFING_CATEGORIES } from "@/lib/kbos/briefing-forms";
import { resetService, saveService } from "@/lib/kbos/services";

const line = (max: number) => z.string().trim().min(1).max(max);
const schema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  priceFrom: z.preprocess(normalizeMoney, z.coerce.number().min(0).max(10_000_000)).nullable().optional(),
  term: z.string().trim().max(120).nullable().optional(),
  includes: z.array(line(140)).max(12).nullable().optional(),
  pitch: z.array(line(500)).max(4).nullable().optional(),
  process: z.array(z.object({ title: line(40), desc: line(180) })).max(4).nullable().optional(),
  active: z.boolean().optional(),
});

const known = (slug: string) => BRIEFING_CATEGORIES.some((c) => c.id === slug);

function refreshSite() {
  // Site público (categorias e formulário de orçamento) volta a gerar na hora.
  revalidatePath("/briefing", "layout");
}

// PUT /api/admin/services/:slug — salva o que o Kayque editou.
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { slug } = await params;
  if (!known(slug)) return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 });
  const body = await readBody(req, schema);
  if ("error" in body) return body.error;
  try {
    await saveService(slug, body.data);
    refreshSite();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

// DELETE /api/admin/services/:slug — volta ao padrão do código.
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { slug } = await params;
  if (!known(slug)) return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 });
  try {
    await resetService(slug);
    refreshSite();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
