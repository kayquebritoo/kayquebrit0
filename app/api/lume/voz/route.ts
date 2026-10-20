import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/kbos/assistant";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3_000_000;
const sha = (v: string) => createHash("sha256").update(v).digest();

// POST /api/lume/voz — o servidor do Lume manda o áudio da busca por voz; aqui vira texto (Whisper do KBOS).
// Autenticação: Bearer com o segredo compartilhado LUME_API_TOKEN (nunca cookie de usuário).
export async function POST(req: Request) {
  const secret = (process.env.LUME_API_TOKEN || "").trim();
  const sent = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!secret || !sent || !timingSafeEqual(sha(secret), sha(sent))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 200 || buf.length > MAX_BYTES) return NextResponse.json({ error: "Áudio vazio ou longo demais." }, { status: 413 });
  const r = await transcribeAudio({
    audioBase64: buf.toString("base64"),
    audioMime: req.headers.get("content-type") || "audio/webm",
    prompt: "Lume, KBOS, chapa mista, Atalaia Vip, hotel, lounge, praça de alimentação, drinks, pôr do sol, praia.",
  });
  if (!r.text) return NextResponse.json({ error: r.error || "Não entendi o áudio." }, { status: 422 });
  return NextResponse.json({ texto: r.text }, { headers: { "Cache-Control": "no-store" } });
}
