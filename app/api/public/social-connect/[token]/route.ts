import { NextResponse } from "next/server";
import { withRateLimit, clientIp } from "@/lib/kbos/rate-limit";
import { serverError } from "@/lib/kbos/http";
import { disconnectAccount, linkAccounts, publicProviderStatus, resolveConnectLink } from "@/lib/kbos/social/connections";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

// GET — link de conexão (sem login): de qual cliente é, redes disponíveis e o que já foi conectado por este link.
export async function GET(req: Request, { params }: Ctx) {
  const limited = await withRateLimit(req, "social:connect");
  if (limited) return limited;
  try {
    const link = await resolveConnectLink((await params).token);
    if (!link) return NextResponse.json({ error: "Link vencido ou cancelado. Peça um novo ao Kayque." }, { status: 404, headers: noStore });
    return NextResponse.json({ project: link.project, expiresAt: link.expiresAt, providers: publicProviderStatus(), items: await linkAccounts(link.id) }, { headers: noStore });
  } catch (e) { return serverError(e); }
}

// DELETE ?id= — quem tem o link desconecta o que conectou por ele (revoga na rede).
export async function DELETE(req: Request, { params }: Ctx) {
  const limited = await withRateLimit(req, "social:connect");
  if (limited) return limited;
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  try {
    const link = await resolveConnectLink((await params).token);
    if (!link) return NextResponse.json({ error: "Link vencido." }, { status: 404 });
    if (!(await linkAccounts(link.id)).some((a) => a.id === id)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    return NextResponse.json(await disconnectAccount(id, { kind: "link", userId: null, ip: clientIp(req), userAgent: req.headers.get("user-agent") }));
  } catch (e) { return serverError(e); }
}
