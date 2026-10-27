import { describe, expect, it } from "vitest";
import { DEFAULT_FROM, normalizeFrom } from "../email";

describe("normalizeFrom (remetente do Resend)", () => {
  it.each([
    ["KBOS <portal@kayquebrito.com.br>", "KBOS <portal@kayquebrito.com.br>"],
    ['"KBOS <contato@kayquebrito.com.br>"', "KBOS <contato@kayquebrito.com.br>"],
    ["contato@kayquebrito.com.br", "KBOS <contato@kayquebrito.com.br>"],
    ["Kayque Brito contato@kayquebrito.com.br", "Kayque Brito <contato@kayquebrito.com.br>"],
    ["KBOS <contato@kayquebrito.com.br", "KBOS <contato@kayquebrito.com.br>"],
    ["'contato@kayquebrito.com.br'", "KBOS <contato@kayquebrito.com.br>"],
  ])("%s → %s", (raw, out) => expect(normalizeFrom(raw)).toBe(out));

  it("sem e-mail válido usa o padrão", () => {
    for (const raw of ["", "   ", "KBOS", "contato@", undefined, null]) expect(normalizeFrom(raw)).toBe(DEFAULT_FROM);
    expect(DEFAULT_FROM).toBe("KBOS <contato@kayquebrito.com.br>");
  });
});
