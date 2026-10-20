// Unitários do cliente Evolution (puros, sem rede).
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildWebhookUrl,
  checkWhatsappNumbers,
  listWhatsappContacts,
  ensureInstance,
  evoConfig,
  evoExplicitConfigured,
  evoFallbackActive,
  extractPairingCode,
  getQrCode,
  getWebhookStatus,
  mapState,
  normalizePhoneNumber,
  normalizeQr,
  setInstanceWebhook,
  waUsingDefaultKey,
} from "../evolution";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function mockEvo(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const r = handler(url, init);
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    })
  );
}

const BASE_ENV = {
  EVOLUTION_API_URL: "http://evolution:8080",
  EVOLUTION_API_KEY: "test-key",
  EVOLUTION_INSTANCE: "kbos-primary",
  APP_URL: "https://kbos.kayquebrito.com.br",
};

describe("mapState", () => {
  it("mapeia os 3 estados oficiais", () => {
    expect(mapState("open")).toBe("open");
    expect(mapState("connecting")).toBe("connecting");
    expect(mapState("close")).toBe("close");
  });
  it("desconhecido vira unknown", () => {
    expect(mapState("banana")).toBe("unknown");
    expect(mapState(null)).toBe("unknown");
    expect(mapState(undefined)).toBe("unknown");
  });
});

describe("normalizeQr", () => {
  it("preserva data-uri pronta", () => {
    const d = "data:image/png;base64,iVBOR";
    expect(normalizeQr(d)).toBe(d);
  });
  it("prefixa base64 cru", () => {
    expect(normalizeQr("iVBOR")).toBe("data:image/png;base64,iVBOR");
  });
  it("null p/ vazio/não-string", () => {
    expect(normalizeQr(null)).toBeNull();
    expect(normalizeQr("")).toBeNull();
    expect(normalizeQr(123)).toBeNull();
  });
});

describe("waUsingDefaultKey", () => {
  it("detecta a chave default de dev", () => {
    vi.stubEnv("EVOLUTION_API_KEY", "kbos-dev-key");
    expect(waUsingDefaultKey()).toBe(true);
    vi.stubEnv("EVOLUTION_API_KEY", "outra-forte");
    expect(waUsingDefaultKey()).toBe(false);
  });
});

describe("evoConfig (zero-config)", () => {
  it("env vazia resolve para os padrões internos", () => {
    vi.stubEnv("EVOLUTION_API_URL", "");
    vi.stubEnv("EVOLUTION_API_KEY", "");
    vi.stubEnv("EVOLUTION_INSTANCE", "");
    expect(evoConfig()).toEqual({
      url: "http://evolution:8080",
      key: "kbos-dev-key",
      instance: "kbos-primary",
    });
    expect(evoExplicitConfigured()).toBe(false);
    expect(evoFallbackActive()).toBe(true);
  });
  it("env preenchida vence os padrões", () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    expect(evoConfig()).toEqual({
      url: "http://evolution:8080",
      key: "test-key",
      instance: "kbos-primary",
    });
    expect(evoExplicitConfigured()).toBe(true);
    expect(evoFallbackActive()).toBe(false);
  });
  it("fallback parcial: mantém o que veio do env", () => {
    vi.stubEnv("EVOLUTION_API_URL", "https://evo.externa:8080");
    vi.stubEnv("EVOLUTION_API_KEY", "");
    vi.stubEnv("EVOLUTION_INSTANCE", "");
    expect(evoConfig()).toMatchObject({ url: "https://evo.externa:8080", key: "kbos-dev-key" });
    expect(evoFallbackActive()).toBe(true);
  });
});

describe("ensureInstance", () => {
  it("cria a instância quando connectionState dá 404", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    const calls: string[] = [];
    mockEvo((url) => {
      calls.push(url);
      if (url.endsWith("/instance/connectionState/kbos-primary")) {
        return calls.length === 1
          ? { status: 404, body: {} }
          : { status: 200, body: { instance: { state: "connecting" } } };
      }
      if (url.endsWith("/instance/create")) return { status: 201, body: { instance: {} } };
      if (url.includes("/webhook/set/")) return { status: 200, body: {} };
      return { status: 500, body: {} };
    });
    const r = await ensureInstance();
    expect(r.created).toBe(true);
    expect(r.state).toBe("connecting");
    expect(calls.some((c) => c.endsWith("/instance/create"))).toBe(true);
  });

  it("não recria quando a instância já existe", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    mockEvo(() => ({ status: 200, body: { instance: { state: "open" } } }));
    const r = await ensureInstance();
    expect(r.created).toBe(false);
    expect(r.state).toBe("open");
  });

  it("falha fechada quando a criação é rejeitada", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    mockEvo((url) =>
      url.endsWith("/instance/create")
        ? { status: 500, body: {} }
        : { status: 404, body: {} }
    );
    const r = await ensureInstance();
    expect(r.created).toBe(false);
    expect(r.detail).toMatch(/500/);
  });
});

describe("setInstanceWebhook", () => {
  it("false sem APP_URL com Evolution externa (best-effort)", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("EVOLUTION_API_URL", "https://evo.exemplo.com");
    vi.stubEnv("APP_URL", "");
    expect(await setInstanceWebhook()).toBe(false);
  });

  it("anexa ?token= quando o segredo está configurado", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "segredo-123");
    let posted: unknown = null;
    mockEvo((url, init) => {
      if (url.includes("/webhook/set/")) {
        posted = JSON.parse((init?.body as string) ?? "{}");
        return { status: 200, body: {} };
      }
      return { status: 404, body: {} };
    });
    expect(await setInstanceWebhook()).toBe(true);
    const wh = (posted as { webhook: Record<string, unknown> }).webhook;
    expect(wh.url).toContain("?token=segredo-123");
  });

  it("usa o corpo aninhado da v2 e cai para o formato v1 se recusado", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    const bodies: Record<string, unknown>[] = [];
    mockEvo((url, init) => {
      if (!url.includes("/webhook/set/")) return { status: 404, body: {} };
      const b = JSON.parse((init?.body as string) ?? "{}");
      bodies.push(b);
      // Simula build v1: recusa o formato aninhado.
      return { status: b.webhook ? 400 : 200, body: {} };
    });
    expect(await setInstanceWebhook()).toBe(true);
    expect(bodies[0]).toMatchObject({
      webhook: { enabled: true, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE"] },
    });
    expect(bodies[1]).toMatchObject({ enabled: true, url: "http://web:3000/api/webhooks/evolution/" });
  });
});

describe("buildWebhookUrl", () => {
  it("Evolution externa: null sem APP_URL; pública com barra final; token quando ≥8 chars", () => {
    vi.stubEnv("EVOLUTION_API_URL", "https://evo.exemplo.com");
    vi.stubEnv("EVOLUTION_WEBHOOK_BASE", "");
    vi.stubEnv("APP_URL", "");
    expect(buildWebhookUrl()).toBeNull();
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br/");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    expect(buildWebhookUrl()).toBe("https://kbos.kayquebrito.com.br/api/webhooks/evolution/");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "segredo-123");
    expect(buildWebhookUrl()).toBe(
      "https://kbos.kayquebrito.com.br/api/webhooks/evolution/?token=segredo-123"
    );
  });

  it("Evolution na mesma rede Docker: chama o app pela rede interna", () => {
    vi.stubEnv("EVOLUTION_API_URL", "http://evolution:8080");
    vi.stubEnv("EVOLUTION_WEBHOOK_BASE", "");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br");
    expect(buildWebhookUrl()).toBe("http://web:3000/api/webhooks/evolution/");
    vi.stubEnv("EVOLUTION_WEBHOOK_BASE", "http://kbos-web:3000/");
    expect(buildWebhookUrl()).toBe("http://kbos-web:3000/api/webhooks/evolution/");
  });
});

describe("getWebhookStatus", () => {
  it("ok quando a URL confere; false em mismatch ou 404", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    const ours = "http://web:3000/api/webhooks/evolution/";
    mockEvo(() => ({ status: 200, body: { enabled: true, url: ours } }));
    expect(await getWebhookStatus()).toMatchObject({ ok: true, url: ours });
    mockEvo(() => ({ status: 200, body: { enabled: true, url: "https://outra/x" } }));
    expect((await getWebhookStatus()).ok).toBe(false);
    mockEvo(() => ({ status: 200, body: { webhook: { enabled: true, url: ours } } }));
    expect(await getWebhookStatus()).toMatchObject({ ok: true, url: ours });
    mockEvo(() => ({ status: 404, body: {} }));
    expect(await getWebhookStatus()).toMatchObject({ ok: false, url: null });
  });
});

describe("normalizePhoneNumber", () => {
  it("aceita DDI+DDD+número (10–15 dígitos)", () => {
    expect(normalizePhoneNumber("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizePhoneNumber("5511999998888")).toBe("5511999998888");
  });
  it("rejeita curto, longo e vazio", () => {
    expect(normalizePhoneNumber("123456789")).toBeNull();
    expect(normalizePhoneNumber("1".repeat(16))).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
  });
});

describe("getQrCode com pareamento", () => {
  it("anexa ?number= e retorna o pairing code", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    let seenUrl = "";
    mockEvo((url) => {
      seenUrl = url;
      return { status: 200, body: { base64: "iVBOR", pairingCode: "ABCD-1234" } };
    });
    const r = await getQrCode("5511999998888");
    expect(seenUrl).toContain("?number=5511999998888");
    expect(r.pairingCode).toBe("ABCD-1234");
  });
  it("telefone inválido explícito não cai p/ QR silencioso", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    const r = await getQrCode("abc");
    expect(r.qrcode).toBeNull();
    expect(r.pairingCode).toBeNull();
    expect(r.detail).toMatch(/inválido/);
  });
  it("aceita pairing em campo alternativo (code)", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    mockEvo(() => ({ status: 200, body: { base64: "iVBOR", code: "WXYZ-9876" } }));
    const r = await getQrCode("5511999998888");
    expect(r.pairingCode).toBe("WXYZ-9876");
  });
  it("sem código no GET, tenta POST { number } uma vez", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    const calls: string[] = [];
    mockEvo((url, init) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if ((init?.method || "GET") === "POST") {
        return { status: 200, body: { pairingCode: "POST-1122" } };
      }
      return { status: 200, body: { base64: "iVBOR" } };
    });
    const r = await getQrCode("5511999998888");
    expect(r.pairingCode).toBe("POST-1122");
    expect(calls.some((c) => c.startsWith("POST"))).toBe(true);
  });
  it("sem código em nenhum formato: diagnóstico com campos", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    mockEvo(() => ({ status: 200, body: { base64: "iVBOR", count: 3 } }));
    const r = await getQrCode("5511999998888");
    expect(r.pairingCode).toBeNull();
    expect(r.detail).toMatch(/base64,count/);
  });
});

describe("extractPairingCode", () => {
  it("prefere pairingCode; ignora base64 longo em code", () => {
    expect(extractPairingCode({ pairingCode: "AB12-CD34" })).toBe("AB12-CD34");
    expect(extractPairingCode({ code: "XY98-ZW76" })).toBe("XY98-ZW76");
    expect(extractPairingCode({ code: "iVBOR".repeat(20) })).toBeNull();
    expect(extractPairingCode({})).toBeNull();
    expect(extractPairingCode(null)).toBeNull();
  });
});

describe("contatos do WhatsApp", () => {
  it("lista só pessoas, sem duplicar, com foto http", async () => {
    vi.stubEnv("EVOLUTION_API_URL", BASE_ENV.EVOLUTION_API_URL);
    vi.stubEnv("EVOLUTION_API_KEY", BASE_ENV.EVOLUTION_API_KEY);
    mockEvo((url) => url.includes("/chat/findContacts/")
      ? { status: 200, body: [
          { remoteJid: "5591988887777@s.whatsapp.net", pushName: "Thalita", profilePicUrl: "https://pps.whatsapp.net/a.jpg" },
          { remoteJid: "5591988887777@s.whatsapp.net", pushName: "Dup" },
          { remoteJid: "120363000000@g.us", pushName: "Grupo" },
          { remoteJid: "999@lid", pushName: "Lid" },
          { remoteJid: "5591977776666@s.whatsapp.net", pushName: "", profilePicUrl: "data:x" },
        ] }
      : { status: 404, body: {} });
    const r = await listWhatsappContacts();
    expect(r.contacts).toEqual([
      { number: "5591988887777", name: "Thalita", photoUrl: "https://pps.whatsapp.net/a.jpg" },
      { number: "5591977776666", name: "", photoUrl: null },
    ]);
  });
  it("verifica quais números têm WhatsApp e tolera falha", async () => {
    vi.stubEnv("EVOLUTION_API_URL", BASE_ENV.EVOLUTION_API_URL);
    vi.stubEnv("EVOLUTION_API_KEY", BASE_ENV.EVOLUTION_API_KEY);
    mockEvo(() => ({ status: 200, body: [{ exists: true, number: "5591988887777" }, { exists: false, number: "5591977776666" }] }));
    expect(await checkWhatsappNumbers(["5591988887777", "5591977776666", "5591900000000"])).toEqual({ "5591988887777": true, "5591977776666": false, "5591900000000": null });
    mockEvo(() => ({ status: 500, body: {} }));
    expect(await checkWhatsappNumbers(["5591988887777"])).toEqual({ "5591988887777": null });
  });
});
