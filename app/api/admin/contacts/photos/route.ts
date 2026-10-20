import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { fillWhatsappPhotos } from "@/lib/kbos/contact-photos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/contacts/photos — puxa do WhatsApp a foto de perfil de quem ainda não tem (clientes primeiro), até 60 por chamada.
export async function POST() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const r = await fillWhatsappPhotos(60);
    return NextResponse.json({ checked: r.checked, found: r.found, remaining: r.remaining });
  } catch (e) {
    return serverError(e);
  }
}
