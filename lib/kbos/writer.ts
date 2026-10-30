// Assistente de escrita — Fase 1 do llm-gateway.
//
// Rascunhos internos (legenda, roteiro, texto, ideias) a partir de um briefing
// curto. Mora SEPARADO do cérebro do assistente (AI_*), da transcrição (STT_*)
// e da voz (TTS_*): ligar o escritor não muda nada nesses fluxos.
//
// Regras (docs/llm/PLANO_INTEGRACAO_VPS.md, Fase 1):
// - Só fala com o llm-gateway próprio (WRITER_BASE_URL); sem URL = desligado.
//   Nunca cai na OpenAI por padrão.
// - Só modelos `:free` — qualquer outro nome desliga o escritor antes da rede.
// - Sem contexto do banco, sem ações externas, sem persistência: entra só o
//   briefing digitado pela equipe e sai só o rascunho.
//   WRITER_BASE_URL / WRITER_API_KEY / WRITER_MODEL

export const WRITER_DEFAULT_MODEL = "openrouter/cohere/north-mini-code:free";

export const WRITER_KINDS = ["legenda", "roteiro", "texto", "ideias"] as const;
export type WriterKind = (typeof WRITER_KINDS)[number];

export type WriterConfig = {
  url: string | null;
  key: string | null;
  model: string;
  enabled: boolean;
  reason: string | null;
};

export function isFreeModel(model: string): boolean {
  return /:free$/.test(model.trim());
}

export function writerConfig(): WriterConfig {
  const env = (n: string) => (process.env[`WRITER_${n}`] || "").trim();
  const url = env("BASE_URL").replace(/\/$/, "") || null;
  const key = env("API_KEY") || null;
  const model = env("MODEL") || WRITER_DEFAULT_MODEL;
  let reason: string | null = null;
  if (!url) reason = "WRITER_BASE_URL vazio.";
  else if (!isFreeModel(model)) reason = "WRITER_MODEL precisa terminar em :free.";
  return { url, key, model, enabled: !reason, reason };
}

const KIND_RULES: Record<WriterKind, string> = {
  legenda: "Escreva uma legenda curta para Instagram (até 6 linhas), com chamada final e no máximo 5 hashtags.",
  roteiro: "Escreva um roteiro curto de Reels/vídeo (até 45 s) em cenas numeradas: imagem + fala/texto na tela.",
  texto: "Escreva um texto corrido claro e objetivo, em parágrafos curtos.",
  ideias: "Liste de 5 a 8 ideias de conteúdo, uma por linha, cada uma com título e uma frase de descrição.",
};

export function buildWriterPrompt(kind: WriterKind, tone?: string): string {
  const t = (tone || "").trim();
  return [
    "Você é o redator interno da KBOS (Kayque Brito Studio).",
    "Responda sempre em português do Brasil.",
    KIND_RULES[kind],
    "Nunca invente preços, prazos, endereços, telefones ou links.",
    "Entregue só o rascunho, sem comentários sobre ele.",
    t ? `Tom desejado: ${t}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type Draft = { text: string; stub: boolean; model: string };

export async function writeDraft(input: { kind: WriterKind; brief: string; tone?: string }): Promise<Draft> {
  const cfg = writerConfig();
  if (!cfg.enabled || !cfg.url) {
    return {
      text: `✍️ (modo base) Assistente de escrita desligado: ${cfg.reason ?? "sem configuração."}`,
      stub: true,
      model: cfg.model,
    };
  }
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: "POST",
    headers: {
      ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: buildWriterPrompt(input.kind, input.tone) },
        { role: "user", content: input.brief },
      ],
      max_tokens: 700,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Escritor: HTTP ${res.status}.`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (json.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("Escritor retornou vazio.");
  return { text, stub: false, model: cfg.model };
}
