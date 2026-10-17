// Unitários da Fase 3 — assistente (sem rede: modo base/stub).
import { afterEach, describe, expect, it } from "vitest";
import { buildSystemPrompt, chatReply, transcribeAudio } from "../assistant";

const KEYS = ["OPENAI_API_KEY", "ASSISTANT_SYSTEM_PROMPT", "AI_MODEL"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("buildSystemPrompt", () => {
  it("padrão em pt-BR sem override", () => {
    delete process.env.ASSISTANT_SYSTEM_PROMPT;
    const p = buildSystemPrompt();
    expect(p).toContain("português do Brasil");
    expect(p).not.toContain("Instruções de voz");
  });
  it("voicePrompt do turno vence o env", () => {
    process.env.ASSISTANT_SYSTEM_PROMPT = "do env";
    expect(buildSystemPrompt("seja pirata")).toContain("seja pirata");
    expect(buildSystemPrompt("seja pirata")).not.toContain("do env");
  });
  it("env vale quando sem voicePrompt", () => {
    process.env.ASSISTANT_SYSTEM_PROMPT = "do env";
    expect(buildSystemPrompt()).toContain("do env");
  });
});

describe("chatReply (modo base)", () => {
  it("stub sinalizado sem chave", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await chatReply("sys", "quanto custa um site?");
    expect(r.stub).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("transcribeAudio", () => {
  it("sem áudio = stub com erro", async () => {
    const r = await transcribeAudio({});
    expect(r).toMatchObject({ text: null, stub: true });
  });
  it("sem chave = stub mesmo com áudio", async () => {
    delete process.env.OPENAI_API_KEY;
    const b64 = Buffer.from("fake-audio").toString("base64");
    const r = await transcribeAudio({ audioBase64: b64, audioMime: "audio/ogg" });
    expect(r.stub).toBe(true);
    expect(r.text).toBeNull();
  });
});

describe("audioFilename", () => {
  it("escolhe a extensão pelo mime (iPhone, Chrome, WhatsApp)", async () => {
    const { audioFilename } = await import("../assistant");
    expect(audioFilename("audio/mp4")).toBe("audio.m4a");
    expect(audioFilename("audio/webm;codecs=opus")).toBe("audio.webm");
    expect(audioFilename("audio/ogg; codecs=opus")).toBe("audio.ogg");
    expect(audioFilename("")).toBe("audio.ogg");
  });
});
