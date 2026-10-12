// Deploy por token — helpers puros (sem I/O).
import { describe, expect, it, vi } from "vitest";

describe("isDeployToken", () => {
  it("fail-closed sem DEPLOY_TOKEN", async () => {
    vi.stubEnv("DEPLOY_TOKEN", "");
    const { isDeployToken } = await import("../deploy");
    expect(isDeployToken("qualquer-coisa")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("aceita o segredo exato, rejeita o resto", async () => {
    vi.stubEnv("DEPLOY_TOKEN", "segredo-de-16+-chars-ok");
    const { isDeployToken } = await import("../deploy");
    expect(isDeployToken("segredo-de-16+-chars-ok")).toBe(true);
    expect(isDeployToken("segredo-de-16+-chars-oK")).toBe(false);
    expect(isDeployToken("")).toBe(false);
    expect(isDeployToken(null)).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("isFullSha / bearerToken", () => {
  it("valida SHA de 40 hex", async () => {
    const { isFullSha, bearerToken } = await import("../deploy");
    expect(isFullSha("a".repeat(40))).toBe(true);
    expect(isFullSha("abc")).toBe(false);
    expect(isFullSha(123)).toBe(false);
    const req = new Request("http://x/", { headers: { Authorization: "Bearer abc123" } });
    expect(bearerToken(req)).toBe("abc123");
    expect(bearerToken(new Request("http://x/"))).toBeNull();
  });
});
