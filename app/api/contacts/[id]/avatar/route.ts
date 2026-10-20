import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { photoHostOk, refreshOnePhoto } from "@/lib/kbos/contact-photos";

export const dynamic = "force-dynamic";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function grab(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > 0 && buf.byteLength < 3_000_000 ? { buf, type } : null;
  } catch { return null; }
}

// GET /api/contacts/:id/avatar — serve a foto do contato; se o link do WhatsApp expirou, busca outro e guarda.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), ...STAFF);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const [c] = await db().select({ photoUrl: contacts.photoUrl }).from(contacts).where(eq(contacts.id, id)).limit(1);
  let url = c?.photoUrl && photoHostOk(c.photoUrl) ? c.photoUrl : null;
  let img = url ? await grab(url) : null;
  if (!img) {
    url = await refreshOnePhoto(id);
    img = url && photoHostOk(url) ? await grab(url) : null;
  }
  if (!img) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, max-age=300" } });
  return new Response(img.buf, { headers: { "Content-Type": img.type, "Cache-Control": "private, max-age=43200" } });
}
