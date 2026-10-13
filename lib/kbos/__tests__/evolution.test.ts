// Unitários do cliente Evolution (puros, sem rede).
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildWebhookUrl,
  ensureInstance,
  evoConfig,
  evoExplicitConfigured,
  evoFallbackActive,
  getWebhookStatus,
  mapState,
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
  it("false sem APP_URL (best-effort)", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
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
    expect((posted as Record<string, string>).url).toContain("?token=segredo-123");
  });
});

describe("buildWebhookUrl", () => {
  it("null sem APP_URL; sem token por padrão; com token quando ≥8 chars", () => {
    vi.stubEnv("APP_URL", "");
    expect(buildWebhookUrl()).toBeNull();
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br/");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    expect(buildWebhookUrl()).toBe("https://kbos.kayquebrito.com.br/api/webhooks/evolution");
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "segredo-123");
    expect(buildWebhookUrl()).toBe(
      "https://kbos.kayquebrito.com.br/api/webhooks/evolution?token=segredo-123"
    );
  });
});

describe("getWebhookStatus", () => {
  it("ok quando a URL confere; false em mismatch ou 404", async () => {
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "");
    const ours = "https://kbos.kayquebrito.com.br/api/webhooks/evolution";
    mockEvo(() => ({ status: 200, body: { enabled: true, url: ours } }));
    expect(await getWebhookStatus()).toMatchObject({ ok: true, url: ours });
    mockEvo(() => ({ status: 200, body: { enabled: true, url: "https://outra/x" } }));
    expect((await getWebhookStatus()).ok).toBe(false);
    mockEvo(() => ({ status: 404, body: {} }));
    expect(await getWebhookStatus()).toMatchObject({ ok: false, url: null });
  });
});
