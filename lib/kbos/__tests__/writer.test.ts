// Unitários do assistente de escrita (Fase 1 do llm-gateway). Sem rede real.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWriterPrompt, isFreeModel, writeDraft, writerConfig, WRITER_DEFAULT_MODEL } from "../writer";

const KEYS = ["WRITER_BASE_URL", "WRITER_API_KEY", "WRITER_MODEL", "OPENAI_API_KEY", "AI_BASE_URL", "AI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("writerConfig", () => {
  it("desligado sem WRITER_BASE_URL, mesmo com chaves da OpenAI", () => {
    delete process.env.WRITER_BASE_URL;
    process.env.OPENAI_API_KEY = "sk-teste";
    process.env.AI_API_KEY = "sk-teste";
    const c = writerConfig();
    expect(c.enabled).toBe(false);
    expect(c.url).toBeNull();
  });
  it("modelo padrão é :free", () => {
    process.env.WRITER_BASE_URL = "http://llm-gateway:4000/v1/";
    delete process.env.WRITER_MODEL;
    const c = writerConfig();
    expect(c.enabled).toBe(true);
    expect(c.url).toBe("http://llm-gateway:4000/v1");
    expect(c.model).toBe(WRITER_DEFAULT_MODEL);
  });
  it("modelo pago desliga antes da rede", async () => {
    process.env.WRITER_BASE_URL = "http://llm-gateway:4000/v1";
    process.env.WRITER_MODEL = "openai/gpt-5.4";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(writerConfig().enabled).toBe(false);
    const d = await writeDraft({ kind: "legenda", brief: "almoço de domingo" });
    expect(d.stub).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isFreeModel", () => {
  it("só aceita sufixo :free", () => {
    expect(isFreeModel("openrouter/cohere/north-mini-code:free")).toBe(true);
    expect(isFreeModel("openrouter/nvidia/nemotron-3.5-lightning-free")).toBe(false);
    expect(isFreeModel("gpt-4o-mini")).toBe(false);
  });
});

describe("buildWriterPrompt", () => {
  it("pt-BR, regra do tipo e tom", () => {
    const p = buildWriterPrompt("roteiro", "divertido");
    expect(p).toContain("português do Brasil");
    expect(p).toContain("roteiro");
    expect(p).toContain("divertido");
  });
});

describe("writeDraft", () => {
  it("chama só o gateway com o modelo :free e devolve o texto", async () => {
    process.env.WRITER_BASE_URL = "http://llm-gateway:4000/v1";
    process.env.WRITER_API_KEY = "tok";
    delete process.env.WRITER_MODEL;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: " Rascunho " } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const d = await writeDraft({ kind: "ideias", brief: "pratos da semana" });
    expect(d).toEqual({ text: "Rascunho", stub: false, model: WRITER_DEFAULT_MODEL });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://llm-gateway:4000/v1/chat/completions");
    expect(JSON.parse(String(init.body)).model).toBe(WRITER_DEFAULT_MODEL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
  it("erro HTTP vira exceção", async () => {
    process.env.WRITER_BASE_URL = "http://llm-gateway:4000/v1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 429 })));
    await expect(writeDraft({ kind: "texto", brief: "x" })).rejects.toThrow("HTTP 429");
  });
});
