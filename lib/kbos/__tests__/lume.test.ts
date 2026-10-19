import { describe, expect, it } from "vitest";
import { LUME_DEFAULT_ENDPOINT, parseLumeEndpoint } from "../lume";

describe("endereço do Lume", () => {
  it("aceita o padrão e endereços do próprio computador", () => {
    expect(parseLumeEndpoint(LUME_DEFAULT_ENDPOINT)).toEqual({ ok: true, url: "http://127.0.0.1:8765", kind: "este-computador" });
    expect(parseLumeEndpoint("localhost:8765")).toMatchObject({ ok: true, url: "http://localhost:8765" });
    expect(parseLumeEndpoint("http://[::1]:8765/qualquer/caminho?x=1")).toMatchObject({ ok: true, url: "http://[::1]:8765" });
  });
  it("aceita IP de rede privada e .local, marcando como rede local", () => {
    expect(parseLumeEndpoint("192.168.0.20:8765")).toMatchObject({ ok: true, kind: "rede-local" });
    expect(parseLumeEndpoint("10.1.2.3")).toMatchObject({ ok: true, kind: "rede-local" });
    expect(parseLumeEndpoint("172.20.0.5")).toMatchObject({ ok: true, kind: "rede-local" });
    expect(parseLumeEndpoint("macbook.local:8765")).toMatchObject({ ok: true, kind: "rede-local" });
  });
  it("recusa internet pública, VPS, credenciais e esquemas estranhos", () => {
    for (const bad of ["", "   ", "https://kbos.kayquebrito.com.br", "179.236.67.19:8765", "172.32.0.1", "192.169.0.1", "http://user:senha@127.0.0.1", "javascript:alert(1)", "ftp://127.0.0.1", "300.1.1.1"]) {
      expect(parseLumeEndpoint(bad).ok, bad).toBe(false);
    }
  });
});

import { createHmac } from "node:crypto";
import { lumeEntryUrl } from "../lume";

describe("link de entrada do Lume online", () => {
  it("assina expira+HMAC que o servidor Python reconhece", () => {
    const u = new URL(lumeEntryUrl("https://lume.exemplo.com/", "segredo", 1000));
    expect(u.origin + u.pathname).toBe("https://lume.exemplo.com/entrar");
    expect(u.searchParams.get("e")).toBe("1120");
    expect(u.searchParams.get("s")).toBe(createHmac("sha256", "segredo").update("entrar:1120").digest("hex"));
  });
});
