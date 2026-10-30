import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { readBody, writerDraftSchema } from "@/lib/kbos/validators";
import { writeDraft, writerConfig } from "@/lib/kbos/writer";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// Assistente de escrita (Fase 1 do llm-gateway) — só modelos :free.
// GET  — status (sem expor segredos).
// POST — `{ kind, brief, tone? }` → `{ text, stub, model }`. Não persiste nada
// e não dispara nenhuma ação externa.
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const cfg = writerConfig();
  return NextResponse.json({ enabled: cfg.enabled, model: cfg.model, reason: cfg.reason });
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "ai:writer");
  if (limited) return limited;
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const parsed = await readBody(req, writerDraftSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return NextResponse.json(await writeDraft(parsed.data));
  } catch (e) {
    return serverError(e, 502);
  }
}
