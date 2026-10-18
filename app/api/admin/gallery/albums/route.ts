import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { createAlbum, listAlbums } from "@/lib/kbos/gallery";
import { galleryAdmin } from "@/lib/kbos/gallery-auth";

export const dynamic = "force-dynamic";
const schema = z.object({
  title: z.string().trim().min(2).max(120),
  brand: z.string().trim().max(80).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  expiresInDays: z.number().int().min(1).max(365).nullish(),
  contactId: z.string().uuid().nullish(),
});

export async function GET(req: Request) {
  const denied = await galleryAdmin(req);
  if (denied) return denied;
  try { return NextResponse.json({ albums: await listAlbums() }); } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  const denied = await galleryAdmin(req);
  if (denied) return denied;
  const body = await readBody(req, schema);
  if ("error" in body) return body.error;
  try {
    const d = body.data;
    const { id, token } = await createAlbum({ title: d.title, brand: d.brand, eventDate: d.eventDate, contactId: d.contactId, expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86_400_000) : null });
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    return NextResponse.json({ id, link: `${base}/galeria/${token}/` });
  } catch (e) { return serverError(e); }
}
