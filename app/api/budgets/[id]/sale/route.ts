import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { issueSaleLink, undoAcceptedSale } from "@/lib/kbos/sales";
import { serverError } from "@/lib/kbos/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  try {
    const result = await issueSaleLink(id, body);
    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    return NextResponse.json({ url: `${base}/proposta/${result.token}/`, expiresAt: result.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return serverError(e); }
}

// Desfaz um aceite de teste. Corpo: { "confirm": "#14002" }. Só admin; recusa se houver cobrança paga.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  let body: { confirm?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  try {
    return NextResponse.json(await undoAcceptedSale(id, typeof body.confirm === "string" ? body.confirm : ""), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return serverError(e); }
}
