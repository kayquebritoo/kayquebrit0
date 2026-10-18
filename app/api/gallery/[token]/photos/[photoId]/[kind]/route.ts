import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/kbos/http";
import { readPhoto } from "@/lib/kbos/gallery";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export const dynamic = "force-dynamic";
const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const ok = (id: string) => z.string().uuid().safeParse(id).success;

// Miniatura e prévia: quem tem o link vê.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; photoId: string; kind: string }> }) {
  const { token, photoId, kind } = await params;
  if (!ok(photoId) || (kind !== "thumb" && kind !== "preview")) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  try {
    const f = await readPhoto(token, photoId, kind);
    return new NextResponse(new Uint8Array(f.bytes), { headers: { ...base, "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) { return serverError(e); }
}

// Download: só para quem autorizou (WhatsApp no corpo da requisição, não na URL).
export async function POST(req: Request, { params }: { params: Promise<{ token: string; photoId: string; kind: string }> }) {
  const limited = await withRateLimit(req, "gallery:act");
  if (limited) return limited;
  const { token, photoId, kind } = await params;
  if (!ok(photoId) || kind !== "download") return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const body = z.object({ phone: z.string().max(30) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Informe seu WhatsApp." }, { status: 400 });
  try {
    const f = await readPhoto(token, photoId, "download", body.data.phone);
    return new NextResponse(new Uint8Array(f.bytes), { headers: { ...base, "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${f.name.replace(/[^\w.\-]/g, "_")}"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return serverError(e); }
}
