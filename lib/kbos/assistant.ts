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

/**
 * Provedores trocáveis por configuração (qualquer servidor no padrão OpenAI):
 * cérebro (LLM), ouvido (transcrição) e voz (TTS) podem morar em lugares
 * diferentes — ex.: LLM numa API barata, Whisper local na VPS, voz clonada
 * num servidor próprio. Sem URL própria, cai na OpenAI com OPENAI_API_KEY.
 *   AI_BASE_URL / AI_API_KEY / AI_MODEL
 *   STT_BASE_URL / STT_API_KEY / STT_MODEL
 *   TTS_BASE_URL / TTS_API_KEY / TTS_MODEL / TTS_VOICE
 */
export type ProviderConfig = { url: string; key: string | null; model: string; enabled: boolean };
const OPENAI_URL = "https://api.openai.com/v1";
function provider(prefix: "AI" | "STT" | "TTS", defModel: string): ProviderConfig {
  const env = (n: string) => (process.env[`${prefix}_${n}`] || "").trim();
  const url = (env("BASE_URL") || OPENAI_URL).replace(/\/$/, "");
  const own = url !== OPENAI_URL;
  // Na OpenAI, a mesma chave serve para cérebro, ouvido e voz: sem chave
  // própria, usa OPENAI_API_KEY ou a do cérebro (AI_API_KEY) quando ele
  // também aponta para a OpenAI.
  const aiUrl = ((process.env.AI_BASE_URL || "").trim() || OPENAI_URL).replace(/\/$/, "");
  const shared = openaiKey() || (aiUrl === OPENAI_URL ? (process.env.AI_API_KEY || "").trim() : "");
  const key = env("API_KEY") || (own ? "" : shared);
  const legacyModel = prefix === "TTS" ? (process.env.AI_TTS_MODEL || "").trim() : "";
  // Servidor próprio (Ollama, Whisper local) não precisa de chave para estar ligado.
  return { url, key: key || null, model: env("MODEL") || legacyModel || defModel, enabled: own || !!key };
}
export const llmConfig = () => provider("AI", "gpt-4o-mini");
export const sttConfig = () => provider("STT", "whisper-1");
export const ttsConfig = () => provider("TTS", "tts-1");
const authHeader = (c: ProviderConfig): Record<string, string> => (c.key ? { Authorization: `Bearer ${c.key}` } : {});

export function aiModel(): string {
  return llmConfig().model;
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

/**
 * Nome de arquivo com a extensão certa p/ o Whisper, que detecta o formato
 * pela extensão: iPhone grava `audio/mp4`, Chrome/Android `audio/webm`,
 * WhatsApp manda `audio/ogg`. Mandar tudo como `.ogg` quebrava o mic do app.
 */
export function audioFilename(mime: string): string {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m.includes("webm")) return "audio.webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "audio.m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio.mp3";
  if (m.includes("wav")) return "audio.wav";
  return "audio.ogg";
}

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
  const stt = sttConfig();
  if (!stt.enabled || !bytes) {
    return { text: null, stub: true, error: stt.enabled ? "Áudio vazio." : "Sem transcrição configurada (modo base)." };
  }
  try {
    const form = new FormData();
    form.append("model", stt.model);
    form.append("language", "pt");
    form.append("file", new Blob([bytes], { type: mime.split(";")[0] }), audioFilename(mime));
    const res = await fetchTimeout(`${stt.url}/audio/transcriptions`, {
      method: "POST",
      headers: authHeader(stt),
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
  const llm = llmConfig();
  if (!llm.enabled) {
    return {
      text: `🤖 (modo base) Recebi: "${userText.slice(0, 200)}". Configure o cérebro do assistente (AI_BASE_URL ou OPENAI_API_KEY) na VPS para respostas reais.`,
      stub: true,
    };
  }
  const res = await fetchTimeout(`${llm.url}/chat/completions`, {
    method: "POST",
    headers: { ...authHeader(llm), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: llm.model,
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
/**
 * Voz clonada 24 h no ar, sem depender do Mac: Fish Audio
 * (TTS_PROVIDER=fish, TTS_API_KEY, TTS_VOICE = id do modelo de voz).
 */
async function fishSpeech(text: string): Promise<string | null> {
  const key = (process.env.TTS_API_KEY || "").trim();
  const voice = (process.env.TTS_VOICE || "").trim();
  if (!key || !voice) return null;
  try {
    const res = await fetchTimeout("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: (process.env.TTS_MODEL || "s1").trim() || "s1" },
      body: JSON.stringify({ text: text.slice(0, 2000), reference_id: voice, format: "mp3", latency: "normal" }),
    }, 60_000);
    if (!res.ok) {
      console.error("[KBOS voz] Fish Audio", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? `data:audio/mp3;base64,${buf.toString("base64")}` : null;
  } catch (e) {
    console.error("[KBOS voz] Fish Audio", e);
    return null;
  }
}

export const ttsProvider = () => ((process.env.TTS_PROVIDER || "").trim().toLowerCase() === "fish" ? "fish" : "openai");

export async function synthesizeSpeech(text: string, voice?: string): Promise<string | null> {
  if (ttsProvider() === "fish") {
    // Sua voz; se o Fish falhar, cai na voz padrão para não ficar sem resposta.
    const mine = await fishSpeech(text);
    if (mine) return mine;
  }
  const tts = ttsConfig();
  if (!tts.enabled) return null;
  try {
    const res = await fetchTimeout(`${tts.url}/audio/speech`, {
      method: "POST",
      headers: { ...authHeader(tts), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: tts.model,
        voice: (voice || (ttsProvider() === "fish" ? "" : process.env.TTS_VOICE) || process.env.AI_TTS_VOICE || "alloy").trim() || "alloy",
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
    if (!transcript && !sttConfig().enabled) {
      throw coded(
        "A transcrição de áudio ainda não está ligada na VPS. Use o microfone do teclado para ditar.",
        "TRANSCRIBE_UNAVAILABLE"
      );
    }
  }
  if (!transcript) throw coded("Não entendi o áudio. Tente de novo, falando perto do microfone.", "EMPTY_INPUT");

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
