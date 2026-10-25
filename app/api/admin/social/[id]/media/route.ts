import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { CHUNK_BYTES, MediaError, appendMedia, listMedia, removeMedia, reorderMedia, startMedia } from "@/lib/kbos/social-media";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const ID = /^[0-9a-f-]{36}$/i;
const fail = (e: unknown) => (e instanceof MediaError ? NextResponse.json({ error: e.message }, { status: 400 }) : serverError(e));
const view = (m: Awaited<ReturnType<typeof listMedia>>[number]) => ({ id: m.id, name: m.name, kind: m.kind, size: m.size, expectedSize: m.expectedSize, status: m.status, position: m.position });

export async function GET(_req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try { return NextResponse.json({ items: (await listMedia(id)).map(view), chunk: CHUNK_BYTES }); } catch (e) { return fail(e); }
}

// POST (corpo = bytes do pedaço). Cabeçalhos: x-file-name e x-file-size no 1º; x-media-id e x-offset nos seguintes.
export async function POST(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    const mediaId = req.headers.get("x-media-id");
    if (mediaId) {
      if (!ID.test(mediaId)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
      return NextResponse.json(await appendMedia(id, mediaId, Number(req.headers.get("x-offset") || -1), bytes));
    }
    const name = decodeURIComponent(req.headers.get("x-file-name") || "");
    return NextResponse.json(await startMedia(id, name, Number(req.headers.get("x-file-size") || 0), bytes));
  } catch (e) { return fail(e); }
}

// PATCH { order: [ids] } — ordem do carrossel.
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const parsed = await readBody(req, z.object({ order: z.array(z.string().uuid()).max(20) }));
    if ("error" in parsed) return parsed.error;
    await reorderMedia(id, parsed.data.order);
    return NextResponse.json({ items: (await listMedia(id)).map(view) });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  const mediaId = new URL(req.url).searchParams.get("mediaId") || "";
  if (!ID.test(id) || !ID.test(mediaId)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  try { await removeMedia(id, mediaId); return NextResponse.json({ items: (await listMedia(id)).map(view) }); } catch (e) { return fail(e); }
}
