import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { CycleError, PUB_STATUS, listPublications, syncPublications, updatePublication } from "@/lib/kbos/content-cycle";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const ID = /^[0-9a-f-]{36}$/i;

// GET — publicações por rede do conteúdo (1 conteúdo = 1 entrega; cada rede com o próprio status).
export async function GET(_req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try {
    return NextResponse.json({ items: await listPublications([id]) });
  } catch (e) {
    return serverError(e);
  }
}

// PUT { networks } — redes em que o conteúdo sai (remover cancela, nunca apaga o que já saiu).
export async function PUT(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try {
    const parsed = await readBody(req, z.object({ networks: z.array(z.string().max(30)).max(10) }));
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ items: await syncPublications(id, parsed.data.networks) });
  } catch (e) {
    return serverError(e);
  }
}

// PATCH { network, status, url?, error? } — muda o status de UMA rede; o post vira "postado" só quando todas saem.
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!ID.test(id)) return NextResponse.json({ error: "Post inválido." }, { status: 400 });
  try {
    const parsed = await readBody(req, z.object({ network: z.string().min(1).max(30), status: z.enum(PUB_STATUS).optional(), url: z.string().max(1000).nullable().optional(), error: z.string().max(500).nullable().optional() }));
    if ("error" in parsed) return parsed.error;
    const { network, ...patch } = parsed.data;
    const r = await updatePublication(id, network, patch);
    return NextResponse.json({ item: r.publication, state: r.state, items: await listPublications([id]) });
  } catch (e) {
    if (e instanceof CycleError) return NextResponse.json({ error: e.message }, { status: 400 });
    return serverError(e);
  }
}
