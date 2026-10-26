import { describe, expect, it } from "vitest";
import { matchesImportedPost, matchingPublication, publicationUpdateAllowed } from "../social-identity";
import { parseIcs } from "../social-import";
import { reviewContent } from "../social-reconciliation";

const post = (id: string, overrides: Partial<Parameters<typeof reviewContent>[0][number]> = {}) => ({
  id, projectId: "project", brand: "Hotel", title: "Fim de semana", format: "reels", caption: "Legenda",
  scheduledAt: new Date("2026-10-03T18:00:00Z"), externalKey: null, status: "roteiro", linkedTo: null, dismissedAt: null, ...overrides,
});

describe("conferência somente leitura do conteúdo", () => {
  it("mostra diferenças, origem e registros envolvidos sem modificar a entrada", () => {
    const rows = [post("a", { externalKey: "a".repeat(32), status: "postado" }), post("b", { externalKey: "mlabs:profile:id", scheduledAt: new Date("2026-10-03T20:00:00Z"), caption: "Outra legenda" })];
    const before = structuredClone(rows);
    const report = reviewContent(rows);
    expect(report.records).toBe(2);
    expect(report.candidateRecords).toBe(2);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].differences).toEqual(["Etapas diferentes", "Horários diferentes", "Legendas diferentes"]);
    expect(report.groups[0].items.map(item => item.source)).toEqual(["ICS", "mLabs"]);
    expect(rows).toEqual(before);
    expect(report.groups[0].items.every(item => !("caption" in item))).toBe(true);
  });

  it("separa empresas, dias, formatos distintos e itens de marca desconhecida", () => {
    const report = reviewContent([post("a"), post("other-project", { projectId: "another" }), post("b", { brand: "Lounge" }), post("c", { brand: null }), post("d", { brand: null }), post("e", { scheduledAt: new Date("2026-10-04T18:00:00Z") }), post("f", { format: "carrossel", caption: "Legenda diferente" })]);
    expect(report.groups).toHaveLength(0);
    expect(report.unidentified).toBe(2);
  });

  it("sem empresa exige origem importada e roteiro idêntico ou publicação comprovada, sem cruzar marcas", () => {
    const a=post("a",{brand:null,externalKey:"origem-a",status:"postado",networks:["instagram"]});
    const b=post("b",{brand:null,externalKey:"origem-b"});
    expect(reviewContent([a,b,post("hotel")]).groups).toHaveLength(1);
    expect(reviewContent([a,b]).groups[0].items).toHaveLength(2);
    expect(reviewContent([{...a,status:"agendado"},b]).groups).toHaveLength(0);
    expect(reviewContent([{...a,status:"roteiro",script:"Texto"},{...b,script:"Texto"}]).groups).toHaveLength(1);
    expect(reviewContent([a,{...b,scheduledAt:new Date("2026-10-03T19:00:00Z")}]).groups).toHaveLength(0);
  });

  it("reconhece a legenda de título abreviado e une grupos relacionados uma só vez", () => {
    const report = reviewContent([post("a"), post("b", { title: "Título abreviado", format: "outro" }), post("c", { caption: "Outra" })]);
    expect(report.groups).toHaveLength(1);
    expect(report.candidateRecords).toBe(3);
    expect(report.groups[0].items.map(item => item.id)).toEqual(["a", "b", "c"]);
  });

  it("mantém ocultos/vinculados fora dos candidatos e preserva o dia de Belém", () => {
    const report = reviewContent([post("a", { scheduledAt: new Date("2026-10-04T00:30:00Z") }), post("b"), post("c", { linkedTo: "a" }), post("d", { dismissedAt: new Date() })]);
    expect(report.hidden).toBe(2);
    expect(report.records).toBe(2);
    expect(report.groups[0].day).toBe("2026-10-03");
    expect(report.candidateRecords).toBe(2);
  });
});

describe("identidade e etapas de publicações", () => {
  const incoming = { externalKey: "mlabs:profile:id", brand: "Hotel", caption: "Legenda", scheduledAt: new Date("2026-10-03T18:00:00Z") };

  it("não escolhe arbitrariamente dois candidatos nem casa empresas diferentes", () => {
    expect(matchingPublication([post("a"), post("b")], incoming)).toEqual({ match: undefined, ambiguous: true });
    expect(matchingPublication([post("a", { brand: "Lounge" })], incoming)).toEqual({ match: undefined, ambiguous: false });
    expect(matchingPublication([post("a", { brand: null })], incoming)).toEqual({ match: undefined, ambiguous: false });
  });

  it("protege postagem confirmada e não transforma erro em agendado", () => {
    expect(publicationUpdateAllowed("postado", "agendado")).toBe(false);
    expect(publicationUpdateAllowed("postado", "erro")).toBe(false);
    expect(publicationUpdateAllowed("erro", "agendado")).toBe(false);
    expect(publicationUpdateAllowed("erro", "postado")).toBe(true);
    expect(publicationUpdateAllowed("roteiro", "agendado")).toBe(true);
  });

  it("preserva a empresa alterada manualmente quando a chave antiga identifica um único item", () => {
    const [parsed] = parseIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261003T180000\nSUMMARY:HOTEL - Reels Fim de semana\nEND:VEVENT\nEND:VCALENDAR", "project");
    const row = post("old", { externalKey: parsed.legacyKey, brand: "Lounge", title: "Edição manual" });
    expect(matchesImportedPost(parsed, row)).toBe(true);
    expect(matchesImportedPost(parsed, row, true)).toBe(false);
  });
});
