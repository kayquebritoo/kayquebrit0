import { NextResponse } from "next/server";
import { db } from "@/lib/kbos/db";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { handleMorningBriefing } from "@/lib/kbos/morning-briefing";
import { serverError } from "@/lib/kbos/http";

// POST /api/ai/briefing/trigger — disparo manual do briefing matinal (admin).
//
// Executa na hora (varredura + fila de WhatsApp ao admin) para validar o
// conteúdo sem esperar o cron das 08:00. Body opcional `{ dryRun: true }`
// só monta o texto sem enfileirar.
export async function POST(req: Request) {
  const limited = await withRateLimit(req, "ai:assistant");
  if (limited) return limited;
  try {
    db();
  } catch (e) {
    return serverError(e, 503);
  }
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    let dryRun = false;
    try {
      const body = (await req.json()) as { dryRun?: unknown };
      dryRun = body?.dryRun === true;
    } catch {
      dryRun = false; // sem corpo = envio real
    }
    const result = await handleMorningBriefing(new Date(), { dryRun });
    if (!result.sent && !dryRun) {
      return NextResponse.json(
        { ok: false, error: "Briefing montado, mas sem destinatário (REMINDER_WHATSAPP_TO).", ...result },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return serverError(e);
  }
}
