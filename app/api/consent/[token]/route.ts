import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { serverError } from "@/lib/kbos/http";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { decideConsent, viewConsent } from "@/lib/kbos/showcase";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    return NextResponse.json(await viewConsent((await params).token), { headers });
  } catch (e) {
    return serverError(e);
  }
}

const schema = z.object({
  action: z.enum(["grant", "decline", "revoke"]),
  scopes: z.array(z.string().max(30)).max(10).optional(),
  signerName: z.string().trim().max(120).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await withRateLimit(req, "consent:decide");
  if (limited) return limited;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const r = await decideConsent((await params).token, parsed.data.action, parsed.data);
    // Revogação tira o case do ar na hora.
    revalidatePath("/trabalho", "layout");
    revalidatePath("/briefing", "layout");
    return NextResponse.json(r, { headers });
  } catch (e) {
    return serverError(e);
  }
}
