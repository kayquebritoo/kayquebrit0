import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody, waAdminActionSchema } from "@/lib/kbos/validators";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import {
  getConnectionState,
  getQrCode,
  logoutInstance,
  restartInstance,
  waConfigured,
  waInstance,
} from "@/lib/kbos/evolution";

// GET ?qr=1 — status da instância; com qr=1 inclui QR fresco (expira em ~60s).
// Só admin. Sem Evolution configurada → 503 explicativo (não 500).
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "admin:whatsapp");
  if (limited) return limited;
  try {
    if (!waConfigured()) {
      return NextResponse.json(
        {
          configured: false,
          instance: waInstance(),
          state: "unknown",
          qrcode: null,
          error: "Evolution API não configurada (EVOLUTION_API_URL/EVOLUTION_API_KEY).",
        },
        { status: 503 }
      );
    }
    const wantQr = new URL(req.url).searchParams.get("qr") === "1";
    const { state, detail } = await getConnectionState();
    let qrcode: string | null = null;
    let pairingCode: string | null = null;
    // QR só faz sentido fora do `open` — e só quando pedido (expira rápido).
    if (wantQr && state !== "open") {
      const qr = await getQrCode();
      qrcode = qr.qrcode;
      pairingCode = qr.pairingCode;
    }
    return NextResponse.json({
      configured: true,
      instance: waInstance(),
      state,
      qrcode,
      pairingCode,
      ...(detail ? { detail } : {}),
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST {action: restart|logout} — reconexão / desvincular (admin).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const limited = await withRateLimit(req, "admin:whatsapp");
  if (limited) return limited;
  try {
    const parsed = await readBody(req, waAdminActionSchema);
    if ("error" in parsed) return parsed.error;
    const r =
      parsed.data.action === "restart" ? await restartInstance() : await logoutInstance();
    if (!r.ok) return NextResponse.json({ error: r.detail || "Falha." }, { status: 502 });
    return NextResponse.json({ ok: true, action: parsed.data.action });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
