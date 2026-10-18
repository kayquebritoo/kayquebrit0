import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { setAlbumStatus } from "@/lib/kbos/gallery";
import { galleryAdmin } from "@/lib/kbos/gallery-auth";

export const dynamic = "force-dynamic";
const schema = z.object({ status: z.enum(["draft", "published", "closed"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await galleryAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  const body = await readBody(req, schema);
  if ("error" in body) return body.error;
  try { await setAlbumStatus(id, body.data.status); return NextResponse.json({ ok: true }); } catch (e) { return serverError(e); }
}
