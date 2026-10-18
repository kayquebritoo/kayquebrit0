import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/kbos/http";
import { addPhoto } from "@/lib/kbos/gallery";
import { galleryAdmin } from "@/lib/kbos/gallery-auth";

export const dynamic = "force-dynamic";

// POST multipart: thumb, preview, download (JPEG com marca d'água) + name, width, height, takenAt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await galleryAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    const f = await req.formData();
    const file = async (k: string) => {
      const v = f.get(k);
      if (!(v instanceof File)) throw new Error(`falta ${k}`);
      return Buffer.from(await v.arrayBuffer());
    };
    const num = (k: string) => { const n = Number(f.get(k)); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
    const taken = f.get("takenAt");
    const takenAt = typeof taken === "string" && !Number.isNaN(Date.parse(taken)) ? new Date(taken) : null;
    const photoId = await addPhoto(id, { name: String(f.get("name") || "foto.jpg"), width: num("width"), height: num("height"), takenAt, thumb: await file("thumb"), preview: await file("preview"), download: await file("download") });
    return NextResponse.json({ id: photoId });
  } catch (e) {
    if (e instanceof Error && /^falta /.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
