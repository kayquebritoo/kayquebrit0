import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { mlabsConfigured, syncFromMlabs } from "@/lib/kbos/mlabs";

export const dynamic = "force-dynamic";

// GET → a mLabs está conectada? (não revela o token)
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  return NextResponse.json({ configured: mlabsConfigured(), tokenLength: (process.env.MLABS_MCP_TOKEN || "").length });
}

// POST { projectId } → espelha agenda da mLabs no calendário do projeto (somente leitura na mLabs).
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const parsed = z.object({ projectId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escolha um projeto." }, { status: 400 });
  try {
    return NextResponse.json(await syncFromMlabs(parsed.data.projectId));
  } catch (e) {
    return serverError(e);
  }
}
