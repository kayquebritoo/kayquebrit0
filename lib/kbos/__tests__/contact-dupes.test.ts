import { describe, expect, it } from "vitest";
import { duplicateGroups, phoneKey } from "../contact-dupes";

describe("phoneKey", () => {
  it("ignora +55, máscara e o 9 extra", () => {
    expect(phoneKey("+55 (91) 9374-3109")).toBe(phoneKey("91 99374-3109"));
    expect(phoneKey("5591993743109")).toBe(phoneKey("(91) 9374-3109"));
  });
  it("número curto ou vazio não tem chave", () => {
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe("duplicateGroups", () => {
  const c = (id: string, name: string, phone: string, extra: object = {}) => ({ id, name, phone, status: "lead", createdAt: `2026-10-0${id}`, ...extra });
  it("agrupa pelo telefone e deixa o mais completo primeiro", () => {
    const g = duplicateGroups([
      c("1", "+55 (91) 9374-3109", "+55 (91) 9374-3109"),
      c("2", "Kayque Brito", "+55 (91) 9374-3109"),
      c("3", "Kayque Brito", "91 99374-3109", { email: "k@x.com" }),
      c("4", "Outro", "+55 (11) 98888-7777"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
  it("cliente ganha de lead e arquivado é ignorado", () => {
    const g = duplicateGroups([c("1", "Ana", "91 9999-1111"), c("2", "Ana B", "91 9999-1111", { status: "client" }), c("3", "Ana C", "91 9999-1111", { status: "archived" })]);
    expect(g[0].map((x) => x.id)).toEqual(["2", "1"]);
  });

  it("agrupa por e-mail e instagram, encadeando (A-tel-B, B-email-C)", () => {
    const g = duplicateGroups([
      { id: "a", name: "Ana", phone: "+55 91 98888-1111", status: "lead" },
      { id: "b", name: "Ana S", phone: "(91) 8888-1111", email: "Ana@x.com", status: "lead" },
      { id: "c", name: "Ana Silva", phone: null, email: "ana@x.com", status: "lead" },
      { id: "d", name: "Beto", phone: null, instagram: "@beto", status: "lead" },
      { id: "e", name: "Beto R", phone: null, instagram: "beto", status: "lead" },
      { id: "f", name: "Solo", phone: null, status: "lead" },
    ]);
    expect(g.map((x) => x.map((c) => c.id).sort())).toEqual([["a", "b", "c"], ["d", "e"]]);
  });
});
