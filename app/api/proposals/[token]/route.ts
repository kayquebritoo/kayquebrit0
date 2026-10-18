import { NextResponse } from "next/server";
import { saleAcceptanceSchema } from "@/lib/kbos/sale-plan";
import { acceptSale, readSale } from "@/lib/kbos/sales";
import { serverError } from "@/lib/kbos/http";
import { initialCompany } from "@/lib/kbos/planning";
import { withRateLimit } from "@/lib/kbos/rate-limit";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const sale = await readSale((await params).token);
    // Expõe apenas a proposta e os dados da empresa necessários ao aceite; nunca chaves ou hashes internos.
    const { service, startDate, deliveryDate, months, manualUrl, attachments } = sale.plan;
    const companyProfile = await initialCompany(sale);
    return NextResponse.json({ companyProfile, planningUrl: sale.acceptedAt && sale.companyProfile ? `/planejamento/${(await params).token}/` : null, snapshot: sale.snapshot, plan: { service, startDate, deliveryDate, months, manualUrl, attachments }, acceptedAt: sale.acceptedAt, expiresAt: sale.expiresAt }, { headers });
  } catch (e) { return serverError(e); }
}
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await withRateLimit(req, "proposals:accept");
  if (limited) return limited;
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const parsed = saleAcceptanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Informe seu nome e aceite o contrato e o Manual de Identidade." }, { status: 400 });
  try {
    return NextResponse.json(await acceptSale((await params).token, parsed.data.signerName, parsed.data.companyProfile), { headers });
  } catch (e) { return serverError(e); }
}
