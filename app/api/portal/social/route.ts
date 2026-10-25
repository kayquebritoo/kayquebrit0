import { NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { clientIp } from "@/lib/kbos/rate-limit";
import { db } from "@/lib/kbos/db";
import { projects } from "@/lib/kbos/schema";
import { accountsOverview, assignAccountProject, disconnectAccount, providerStatus } from "@/lib/kbos/social/connections";
import { socialManageableProjectIds } from "@/lib/kbos/social/routes";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actor = (req: Request, userId: string) => ({ kind: "cliente" as const, userId, ip: clientIp(req), userAgent: req.headers.get("user-agent") });

// GET — redes do cliente: botões por rede, empresas que ele administra e as contas já conectadas (sem token).
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const ids = await socialManageableProjectIds(user.id);
    const mine = ids.length ? await db().select({ id: projects.id, titulo: projects.titulo, parentId: projects.parentId }).from(projects).where(inArray(projects.id, ids)) : [];
    const items = (await accountsOverview(ids)).map(({ scopes: _s, lastError: _e, ...a }) => a);
    return NextResponse.json({ providers: providerStatus().map(({ scopes: _s, ...p }) => p), projects: mine, items });
  } catch (e) { return serverError(e); }
}

// PATCH { id, projectId } — muda a conta de empresa (só entre as empresas dele).
export async function PATCH(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const parsed = await readBody(req, z.object({ id: z.string().uuid(), projectId: z.string().uuid() }));
    if ("error" in parsed) return parsed.error;
    const ok = await assignAccountProject(parsed.data.id, parsed.data.projectId, actor(req, user.id), await socialManageableProjectIds(user.id));
    return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  } catch (e) { return serverError(e); }
}

// DELETE ?id= — o cliente desconecta: revoga na rede e o KBOS apaga o token.
export async function DELETE(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  try {
    const ids = await socialManageableProjectIds(user.id);
    const own = (await accountsOverview(ids)).some((a) => a.id === id);
    if (!own) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    return NextResponse.json(await disconnectAccount(id, actor(req, user.id)));
  } catch (e) { return serverError(e); }
}
