import { describe, expect, it } from "vitest";
import { contentBrand, summarizeContent } from "./content-summary";

describe("contagem do calendário", () => {
  it("reconcilia as empresas com o total, incluindo conteúdos sem empresa e outras marcas", () => {
    const rows = [
      ...Array.from({ length: 24 }, (_, i) => ({ id: `h${i}`, brand: "Hotel", status: "postado" })),
      ...Array.from({ length: 21 }, (_, i) => ({ id: `l${i}`, brand: "Lounge", status: "producao" })),
      ...Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, brand: "Praça", status: "roteiro" })),
      ...Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, brand: null, status: "roteiro" })),
    ];
    const result = summarizeContent(rows, ["Hotel", "Lounge", "Praça"]);
    expect(result.total).toBe(81);
    expect(result.byBrand.get("")).toBe(16);
    expect([...result.byBrand.values()].reduce((a, b) => a + b, 0)).toBe(result.total);
    expect(summarizeContent([...rows, { id: "other", brand: "Outra", status: "roteiro" }]).byBrand.get("Outra")).toBe(1);
  });
  it("conta o mesmo ID uma vez independentemente das redes; cancelado fica fora do total (igual ao relatório)", () => {
    const row = { id: "1", brand: " Hotel ", status: "postado", networks: ["instagram", "facebook"], copies: 3 };
    const result = summarizeContent([row, row, { ...row, id: "2", status: "cancelado" }]);
    expect(result.total).toBe(1);
    expect(result.active).toBe(1);
    expect(result.cancelled).toBe(1);
    expect(result.byBrand.get("Hotel")).toBe(1);
    expect(contentBrand(" ")).toBe("");
  });
  it("publicado e atrasado vêm da fase calculada no servidor (olha cada rede)", () => {
    const result = summarizeContent([
      { id: "a", brand: "Hotel", status: "postado", phase: "agendado", late: true }, // saiu só em parte das redes
      { id: "b", brand: "Hotel", status: "postado", phase: "publicado", late: false },
      { id: "c", brand: "Lounge", status: "producao", phase: "producao", late: true },
      { id: "d", brand: "Lounge", status: "cancelado", phase: "cancelado", late: false },
    ]);
    expect([result.total, result.published, result.late, result.cancelled]).toEqual([3, 1, 2, 1]);
  });
});
