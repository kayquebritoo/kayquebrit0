import { NextResponse } from "next/server";
import { db } from "@/lib/kbos/db";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { withRateLimit } from "@/lib/kbos/rate-limit";
import { assistantTurnSchema, readBody } from "@/lib/kbos/validators";
import { handleAssistantTurn, llmConfig, sttConfig, ttsConfig } from "@/lib/kbos/assistant";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// POST /api/ai/assistant — base do Assistente de IA com voz.
//
// Body: `{ text }` ou `{ audioUrl | audioBase64 }` (+ `conversationId` ou
// `channelChatId` p/ persistir no inbox, `voicePrompt` p/ personalizar a voz,
// `send: true` p/ entregar via Evolution, `tts: true` p/ gerar áudio).
// Sem `OPENAI_API_KEY`, responde em modo base (`stub: true`) — o contrato é
// o mesmo, então plugar a chave na VPS ativa a IA real sem mudar chamadas.
// GET — o que o assistente consegue fazer agora (a tela decide se grava áudio).
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const llm = llmConfig();
  const owner = (process.env.ASSISTANT_OWNER_PHONE || "").replace(/\D/g, "");
  return NextResponse.json({
    transcription: sttConfig().enabled,
    llm: llm.enabled,
    voice: ttsConfig().enabled,
    // Diagnóstico do agente no WhatsApp (sem expor segredos).
    agent: {
      model: llm.model,
      keyEnding: llm.key ? `…${llm.key.slice(-4)}` : null,
      owner: owner ? `…${owner.slice(-4)}` : null,
      webhookProtected: (process.env.EVOLUTION_WEBHOOK_TOKEN || "").trim().length >= 8,
    },
  });
}

export async function POST(req: Request) {
  const limited = await withRateLimit(req, "ai:assistant");
  if (limited) return limited;
  // Fail-closed quando o banco está fora: `sessionUser` retorna null → 401.
  // (Sem DATABASE_URL não há sessão válida nem inbox p/ persistir o turno.)
  try {
    db();
  } catch (e) {
    return serverError(e, 503);
  }
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, assistantTurnSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    try {
      const turn = await handleAssistantTurn({
        conversationId: b.conversationId,
        channel: b.channel,
        channelChatId: b.channelChatId,
        text: b.text,
        audioUrl: b.audioUrl,
        audioBase64: b.audioBase64,
        audioMime: b.audioMime,
        voicePrompt: b.voicePrompt,
        send: b.send,
        tts: b.tts,
        voice: b.voice,
      });
      return NextResponse.json({ ok: true, ...turn });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EMPTY_INPUT" || code === "NO_CONVERSATION") {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Entrada inválida." }, { status: 400 });
      }
      if (code === "TRANSCRIBE_UNAVAILABLE") {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Transcrição indisponível.", code }, { status: 503 });
      }
      if (code === "NOT_FOUND") {
        return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
      }
      if (code === "EVOLUTION_MISCONFIGURED") {
        return NextResponse.json({ error: "Evolution API não configurada." }, { status: 503 });
      }
      if (code === "CHANNEL_UNSUPPORTED" || code === "CHAT_NOT_DIALABLE") {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Envio indisponível." }, { status: 502 });
      }
      throw e;
    }
  } catch (e) {
    return serverError(e);
  }
}
