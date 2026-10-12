// Assistente de IA com voz — Fase 3 (base de integração).
//
// Pipeline de um turno: áudio → transcrição (Whisper) → LLM c/ prompt de voz
// personalizável → resposta (texto + TTS opcional) → persistência no inbox
// (`sender_type: ai`) e envio opcional via Evolution.
//
// Sem `OPENAI_API_KEY`, cada etapa usa um stub determinístico e sinaliza
// `stub: true` — a base funciona end-to-end sem chaves, e a resposta real é
// só plugar a chave no ambiente (sem mudar o contrato da API).
import { eq } from "drizzle-orm";
import { db } from "./db";
import { conversations, messages } from "./schema";
import { findConversation, sendAgentMessage } from "./inbox";
import {
  createBudget,
  findContactByName,
  formatBRL,
  looksLikeBudgetCommand,
  parseBudgetCommand,
} from "./budgets";

const DEFAULT_SYSTEM = [
  "Você é o assistente da KBOS (Kayque Brito Studio).",
  "Responda em português do Brasil, de forma curta, cordial e objetiva.",
  "Se a mensagem for sobre orçamento, peça o tipo de projeto e o prazo.",
  "Você também cria orçamentos sozinho: quando o usuário pedir (ex.: “criar orçamento site para Maria: página 3000, blog 800”), o sistema registra no banco e confirma com o número.",
  "Nunca invente preços, prazos ou links.",
].join(" ");


export function openaiKey(): string | null {
  const k = (process.env.OPENAI_API_KEY || "").trim();
  return k ? k : null;
}

export function aiModel(): string {
  return (process.env.AI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
}

/**
 * Prompt do sistema: `voicePrompt` personaliza a voz do assistente
 * (tom, papel, instruções); sem ele, vale o padrão + `ASSISTANT_SYSTEM_PROMPT`.
 */
export function buildSystemPrompt(voicePrompt?: string): string {
  const extra = (voicePrompt || "").trim() || (process.env.ASSISTANT_SYSTEM_PROMPT || "").trim();
  return extra ? `${DEFAULT_SYSTEM}\n\nInstruções de voz: ${extra}` : DEFAULT_SYSTEM;
}

async function fetchTimeout(url: string, init: RequestInit, ms = 30_000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/* ---------------- transcrição ---------------- */

export type Transcript = { text: string | null; stub: boolean; error?: string };

export async function transcribeAudio(
  input: { audioUrl?: string; audioBase64?: string; audioMime?: string }
): Promise<Transcript> {
  let bytes: ArrayBuffer | null = null;
  let mime = "audio/ogg";
  try {
    if (input.audioBase64) {
      const buf = Buffer.from(input.audioBase64, "base64");
      if (!buf.length) return { text: null, stub: true, error: "Áudio vazio." };
      bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      mime = input.audioMime || mime;
    } else if (input.audioUrl) {
      const res = await fetchTimeout(input.audioUrl, {}, 20_000);
      if (!res.ok) return { text: null, stub: true, error: `Download do áudio: HTTP ${res.status}.` };
      bytes = await res.arrayBuffer();
      mime = res.headers.get("content-type") || mime;
    } else {
      return { text: null, stub: true, error: "Sem áudio." };
    }
  } catch (e) {
    return { text: null, stub: true, error: e instanceof Error ? e.message : "Falha no áudio." };
  }
  const key = openaiKey();
  if (!key || !bytes) {
    return { text: null, stub: true, error: key ? "Áudio vazio." : "Sem OPENAI_API_KEY (modo base)." };
  }
  try {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("file", new Blob([bytes], { type: mime }), "audio.ogg");
    const res = await fetchTimeout("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    }, 60_000);
    if (!res.ok) return { text: null, stub: true, error: `Whisper: HTTP ${res.status}.` };
    const json = (await res.json()) as { text?: string };
    const text = (json.text || "").trim();
    return text ? { text, stub: false } : { text: null, stub: true, error: "Transcrição vazia." };
  } catch (e) {
    return { text: null, stub: true, error: e instanceof Error ? e.message : "Falha na transcrição." };
  }
}

/* ---------------- resposta (LLM) ---------------- */

export type Reply = { text: string; stub: boolean };

export async function chatReply(system: string, userText: string): Promise<Reply> {
  const key = openaiKey();
  if (!key) {
    return {
      text: `🤖 (modo base) Recebi: "${userText.slice(0, 200)}". Configure OPENAI_API_KEY na VPS para respostas reais do assistente.`,
      stub: true,
    };
  }
  const res = await fetchTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: aiModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  }, 45_000);
  if (!res.ok) throw new Error(`LLM: HTTP ${res.status}.`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (json.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("LLM retornou vazio.");
  return { text, stub: false };
}

/* ---------------- voz (TTS) ---------------- */

/** Gera áudio da resposta (data-URI mp3) ou null (sem chave / falha = não fatal). */
export async function synthesizeSpeech(text: string, voice?: string): Promise<string | null> {
  const key = openaiKey();
  if (!key) return null;
  try {
    const res = await fetchTimeout("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (process.env.AI_TTS_MODEL || "tts-1").trim() || "tts-1",
        voice: (voice || process.env.AI_TTS_VOICE || "alloy").trim() || "alloy",
        input: text.slice(0, 4000),
        response_format: "mp3",
      }),
    }, 60_000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? `data:audio/mp3;base64,${buf.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/* ---------------- orquestração de um turno ---------------- */

export type AssistantTurnInput = {
  conversationId?: string;
  channel?: string;
  channelChatId?: string;
  text?: string;
  audioUrl?: string;
  audioBase64?: string;
  audioMime?: string;
  voicePrompt?: string;
  send?: boolean;
  tts?: boolean;
  voice?: string;
};

export type AssistantTurn = {
  transcript: string | null;
  transcriptStub: boolean;
  reply: string;
  replyStub: boolean;
  conversationId: string | null;
  messageId: string | null;
  sent: boolean;
  ttsAudio: string | null;
  budget: BudgetActionResult | null;
};

export type BudgetActionResult = {
  created: boolean;
  id?: string;
  code?: string;
  title?: string;
  total?: number;
  reason?: string;
};

function coded(message: string, code: string): Error {
  const e = new Error(message);
  (e as NodeJS.ErrnoException).code = code;
  return e;
}

/**
 * Ação autônoma de orçamento: interpreta o texto do turno e, quando for um
 * comando válido ("criar orçamento … com itens e valores"), grava o registro
 * no banco. Nunca quebra o turno — falha vira `reason` + orientação.
 */
export async function tryBudgetAction(
  transcript: string
): Promise<{ note: string; budget: BudgetActionResult | null }> {
  if (!looksLikeBudgetCommand(transcript)) return { note: "", budget: null };
  const parsed = parseBudgetCommand(transcript);
  if (!parsed) {
    return {
      note: "\n\n💡 Para eu criar o orçamento sozinho, diga os itens com valores — ex.: “criar orçamento site para Maria: página inicial 3000, blog 800”.",
      budget: { created: false, reason: "unparsed" },
    };
  }
  try {
    let contactId: string | null = null;
    let contactLabel = "sem cliente vinculado";
    if (parsed.clientName) {
      const found = await findContactByName(parsed.clientName);
      if (found) {
        contactId = found.id;
        contactLabel = `para ${found.name}`;
      } else {
        contactLabel = `para ${parsed.clientName} (cliente não encontrado no CRM — orçamento criado sem vínculo)`;
      }
    }
    const row = await createBudget({
      title: parsed.title,
      contactId,
      items: parsed.items,
    });
    const total = Number(row.totalAmount || 0);
    return {
      note:
        `\n\n✅ Orçamento *${row.code}* criado ${contactLabel}: “${parsed.title}” — ` +
        `${parsed.items.length} item(ns), total *${formatBRL(total)}*. ` +
        `Veja em /admin/orcamentos ou baixe o PDF em /api/budgets/${row.id}/pdf.`,
      budget: { created: true, id: row.id, code: row.code, title: parsed.title, total },
    };
  } catch (e) {
    return {
      note: "\n\n⚠️ Entendi o orçamento, mas não consegui gravá-lo agora. Tente de novo em instantes.",
      budget: { created: false, reason: e instanceof Error ? e.message : "db_error" },
    };
  }
}

export async function handleAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurn> {
  // 1) Resolve a conversa (por id ou pelo chat externo).
  let conv: typeof conversations.$inferSelect | null = null;
  if (input.conversationId) {
    conv =
      (await db().select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1))[0] ??
      null;
    if (!conv) throw coded("Conversa não encontrada.", "NOT_FOUND");
  } else if (input.channelChatId) {
    conv = await findConversation(input.channel || "whatsapp", input.channelChatId);
  }

  // 2) Texto: direto ou transcrito do áudio.
  let transcript: string | null = (input.text || "").trim() || null;
  let transcriptStub = false;
  if (!transcript && (input.audioUrl || input.audioBase64)) {
    const t = await transcribeAudio({
      audioUrl: input.audioUrl,
      audioBase64: input.audioBase64,
      audioMime: input.audioMime,
    });
    transcript = t.text;
    transcriptStub = t.stub;
  }
  if (!transcript) throw coded("Nenhum texto ou áudio aproveitável.", "EMPTY_INPUT");

  // 3) Resposta do LLM (ou stub em modo base).
  const system = buildSystemPrompt(input.voicePrompt);
  const reply = await chatReply(system, transcript);

  // 3b) Ação autônoma: comando de orçamento vira registro no banco e
  // confirmação anexada à resposta (funciona até no modo base, sem LLM).
  const action = await tryBudgetAction(transcript);
  const replyText = action.note ? `${reply.text}${action.note}` : reply.text;

  // 4) Voz opcional (não fatal).
  const ttsAudio = input.tts ? await synthesizeSpeech(replyText, input.voice) : null;

  // 5) Persiste o turno como `ai` e envia se pedido.
  let messageId: string | null = null;
  let sent = false;
  if (conv) {
    const ins = await db()
      .insert(messages)
      .values({
        conversationId: conv.id,
        senderType: "ai",
        content: replyText,
        mediaUrl: null,
        messageType: "text",
        status: "sent",
      })
      .returning({ id: messages.id });
    messageId = ins[0].id;
    if (input.send) {
      await sendAgentMessage(conv, { content: replyText });
      sent = true;
    }
  } else if (input.send) {
    throw coded("`send` exige `conversationId` ou `channelChatId` conhecido.", "NO_CONVERSATION");
  }

  return {
    transcript,
    transcriptStub,
    reply: replyText,
    replyStub: reply.stub,
    conversationId: conv?.id ?? null,
    messageId,
    sent,
    ttsAudio,
    budget: action.budget,
  };
}
