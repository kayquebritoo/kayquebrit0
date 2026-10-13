// Base URL dinâmica: mesma origem do request primeiro, env depois.
import { describe, expect, it, vi, afterEach } from "vitest";
import { appUrl, appUrlEnv, hostBaseFromRequest } from "../email";
import { resolveAppUrl } from "../evolution";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(host: string, proto?: string): Request {
  const headers: Record<string, string> = { host };
  if (proto) headers["x-forwarded-proto"] = proto;
  return new Request("https://x/entrar", { headers });
}

describe("hostBaseFromRequest", () => {
  it("usa o host do request", () => {
    expect(hostBaseFromRequest(req("kayquebrito.com.br"))).toBe("http://kayquebrito.com.br");
  });
  it("x-forwarded-host/proto têm prioridade (proxy)", () => {
    const r = new Request("https://x/", {
      headers: { host: "interno:3000", "x-forwarded-host": "kbos.kayquebrito.com.br", "x-forwarded-proto": "https" },
    });
    expect(hostBaseFromRequest(r)).toBe("https://kbos.kayquebrito.com.br");
  });
  it("rejeita host malicioso (header injection)", () => {
    expect(hostBaseFromRequest(req("a b"))).toBeNull();
    // \n nem chega a existir via Headers reais — simula proxy cru:
    const fake = { headers: { get: (k: string) => (k === "host" ? "evil.com\nSet-Cookie: x" : null) } };
    expect(hostBaseFromRequest(fake as unknown as Request)).toBeNull();
    expect(hostBaseFromRequest(undefined)).toBeNull();
  });
});

describe("appUrl (links p/ o usuário)", () => {
  it("mesma origem do request vence o env", () => {
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br");
    expect(appUrl(req("kayquebrito.com.br", "https"))).toBe("https://kayquebrito.com.br");
  });
  it("sem request, vale o env; sem nada, localhost em dev", () => {
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br");
    expect(appUrl()).toBe("https://kbos.kayquebrito.com.br");
    expect(appUrlEnv()).toBe("https://kbos.kayquebrito.com.br");
    vi.stubEnv("APP_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});

describe("resolveAppUrl (webhooks: backend canônico)", () => {
  it("env explícito vence o host do request", () => {
    vi.stubEnv("APP_URL", "https://kbos.kayquebrito.com.br");
    expect(resolveAppUrl(req("kayquebrito.com.br", "https"))).toBe("https://kbos.kayquebrito.com.br");
  });
  it("sem env, usa a origem do request; sem nada, null", () => {
    vi.stubEnv("APP_URL", "");
    expect(resolveAppUrl(req("kayquebrito.com.br", "https"))).toBe("https://kayquebrito.com.br");
    expect(resolveAppUrl()).toBeNull();
  });
});
