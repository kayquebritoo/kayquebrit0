import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { z } from "zod";
import {
  connectTelegram,
  disconnectTelegram,
  getTelegramStatus,
  telegramWebhookUrl,
} from "@/lib/kbos/telegram";

const actionSchema = z.object({ action: z.enum(["connect", "disconnect"]) });

// GET — status do bot + webhook (admin). Sem token → 200 com `configured:false`
// e instrução (não 500): a UI usa isso p/ mostrar o passo a passo.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const s = await getTelegramStatus();
  return NextResponse.json({ ...s, expectedWebhook: telegramWebhookUrl(req) });
}

// POST {action:"connect"|"disconnect"} — registra/remove o webhook (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "admin:channels");
  if (limited) return limited;
  const parsed = await readBody(req, actionSchema);
  if ("error" in parsed) return parsed.error;
  const r =
    parsed.data.action === "connect" ? await connectTelegram(req) : await disconnectTelegram();
  if (!r.ok) return NextResponse.json({ error: r.detail || "Falha." }, { status: 502 });
  const s = await getTelegramStatus();
  return NextResponse.json({ ok: true, action: parsed.data.action, ...s });
}
