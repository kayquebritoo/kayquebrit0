import { NextResponse } from "next/server";
import { z } from "zod";
import { serverError } from "@/lib/kbos/http";
import { authorizePhotos, readAlbum, revokePhotos } from "@/lib/kbos/gallery";
import { clientIp, withRateLimit } from "@/lib/kbos/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try { return NextResponse.json(await readAlbum((await params).token), { headers }); } catch (e) { return serverError(e); }
}

const ids = z.array(z.string().uuid()).max(200);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mine"), phone: z.string().max(30) }),
  z.object({ action: z.literal("authorize"), name: z.string().max(120), phone: z.string().max(30), photoIds: ids, minor: z.boolean().optional(), guardianName: z.string().max(120).optional(), selfie: z.string().max(300_000).optional() }),
  z.object({ action: z.literal("revoke"), phone: z.string().max(30), photoIds: ids.optional() }),
]);

// Telefone e nome vão no corpo (nunca na URL).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await withRateLimit(req, "gallery:act");
  if (limited) return limited;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Confira os dados informados." }, { status: 400 });
  const { token } = await params;
  try {
    const b = parsed.data;
    if (b.action === "mine") return NextResponse.json(await readAlbum(token, b.phone), { headers });
    if (b.action === "authorize") return NextResponse.json(await authorizePhotos(token, { name: b.name, phone: b.phone, photoIds: b.photoIds, minor: b.minor, guardianName: b.guardianName, selfie: b.selfie, ip: clientIp(req), userAgent: req.headers.get("user-agent") || "" }), { headers });
    return NextResponse.json(await revokePhotos(token, b.phone, b.photoIds), { headers });
  } catch (e) { return serverError(e); }
}
