import { NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/kbos/auth";

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json();
    const r = await requestMagicLink(String(email || ""), name ? String(name) : undefined);
    return NextResponse.json({
      ok: true,
      emailEnviado: r.sent,
      ...(r.devLink ? { devLink: r.devLink } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    const status = msg.includes("DATABASE_URL") ? 503 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
