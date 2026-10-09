import { NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/kbos/auth";
import { authRequestSchema, readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "auth:request");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, authRequestSchema);
    if ("error" in parsed) return parsed.error;
    const r = await requestMagicLink(parsed.data.email, parsed.data.name || undefined);
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
