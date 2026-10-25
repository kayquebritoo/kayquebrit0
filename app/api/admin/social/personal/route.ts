import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { ensurePersonalClient } from "@/lib/kbos/social/connections";

export const dynamic = "force-dynamic";

// POST — cria (ou acha) o cliente "Kayque Brito (pessoal)" para conectar as contas pessoais no mesmo fluxo.
export async function POST() {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try { return NextResponse.json(await ensurePersonalClient(user!.id)); } catch (e) { return serverError(e); }
}
