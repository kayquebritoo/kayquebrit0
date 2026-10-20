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
import { lumeClientEntryUrl, lumeEntryUrl, lumePairCode, lumePastaPath, safeLumePath } from "../lume";

describe("link de entrada do Lume online", () => {
  it("assina expira+HMAC que o servidor Python reconhece", () => {
    const u = new URL(lumeEntryUrl("https://lume.exemplo.com/", "segredo", 1000));
    expect(u.origin + u.pathname).toBe("https://lume.exemplo.com/entrar");
    expect(u.searchParams.get("e")).toBe("1120");
    expect(u.searchParams.get("s")).toBe(createHmac("sha256", "segredo").update("entrar:1120").digest("hex"));
  });
});

describe("destino e código do app", () => {
  it("só aceita caminhos internos do Lume no destino", () => {
    expect(safeLumePath("/?p=Hotel")).toBe("/?p=Hotel");
    for (const bad of ["//evil.com", "https://evil.com", "evil", "/\\evil", "", null, undefined, "/" + "a".repeat(400)]) expect(safeLumePath(bad as string)).toBeNull();
  });
  it("inclui o destino assinado só quando é seguro", () => {
    const ok = new URL(lumeEntryUrl("https://lume.exemplo.com", "x", 1000, lumePastaPath("Praça")));
    expect(ok.searchParams.get("ir")).toBe("/?p=Pra%C3%A7a");
    expect(new URL(lumeEntryUrl("https://lume.exemplo.com", "x", 1000, "//evil.com")).searchParams.get("ir")).toBeNull();
  });
  it("gera código de 8 letras estável na janela de 10 min e diferente na seguinte", () => {
    const a = lumePairCode("segredo", 6000), b = lumePairCode("segredo", 6599), c = lumePairCode("segredo", 6600);
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(b.code).toBe(a.code);
    expect(c.code).not.toBe(a.code);
    expect(a.expiresAt).toBe(7200);
  });
});

describe("entrada do cliente (portal)", () => {
  it("assina presa à pasta, igual ao servidor Python", () => {
    const u = lumeClientEntryUrl("https://lume.exemplo.com/", "segredo", "Atalaia", 1799999880);
    expect(u).toBe("https://lume.exemplo.com/entrar-cliente?e=1800000000&esc=Atalaia&s=c5caf3fa7eafe72bf3792a1bde9900aa5ceb116f5af9c450ea27fc6536f159ad");
  });
  it("outra pasta gera outra assinatura", () => {
    const a = lumeClientEntryUrl("https://x.com", "segredo", "Atalaia", 1000);
    const b = lumeClientEntryUrl("https://x.com", "segredo", "Outro", 1000);
    expect(a.split("&s=")[1]).not.toBe(b.split("&s=")[1]);
  });
});
