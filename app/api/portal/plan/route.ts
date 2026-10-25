import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { PoolError, setOperationLimits } from "@/lib/kbos/plan-pool";
import { managedProjectIds } from "@/lib/kbos/project-members";

export const dynamic = "force-dynamic";

// PUT /api/portal/plan { rootId, limits: { [operacaoId]: n } } — gestão de conteúdo (ou admin) remaneja os posts do mês entre as empresas.
export async function PUT(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "cliente", "admin");
  if (denied || !user) return denied!;
  try {
    const parsed = await readBody(req, z.object({ rootId: z.string().uuid(), limits: z.record(z.string().uuid(), z.number().int()) }));
    if ("error" in parsed) return parsed.error;
    if (user.role === "cliente" && !(await managedProjectIds(user.id)).includes(parsed.data.rootId)) return NextResponse.json({ error: "Só a gestão de conteúdo pode remanejar o plano." }, { status: 403 });
    return NextResponse.json({ ok: true, ...(await setOperationLimits(parsed.data.rootId, parsed.data.limits)) });
  } catch (e) {
    if (e instanceof PoolError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
