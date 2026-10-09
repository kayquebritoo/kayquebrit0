// Unitários do cliente Evolution (puros, sem rede).
import { describe, expect, it } from "vitest";
import { mapState, normalizeQr } from "../evolution";

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
