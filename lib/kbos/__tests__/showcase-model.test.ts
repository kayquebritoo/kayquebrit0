import { describe, expect, it } from "vitest";
import { canPublish, contentHash, neededScopes, slugify, toPublicProject, type CaseRow } from "../showcase-model";

const base = (over: Partial<CaseRow> = {}): CaseRow => ({
  slug: "natan",
  title: "Pará Super Foods",
  status: "draft",
  basis: "consent",
  service: "dev",
  category: null,
  clientName: "Pará Super Foods",
  clientLogo: null,
  year: "2026",
  description: "Site institucional.",
  longDescription: null,
  about: ["Texto."],
  img: "/assets/x.webp",
  gallery: [],
  videoLabel: null,
  videoId: null,
  siteUrl: null,
  metrics: null,
  testimonial: null,
  testimonialAuthor: null,
  ...over,
});
const granted = (c: CaseRow, scopes: string[], over: Record<string, unknown> = {}) => ({
  status: "granted",
  grantedScopes: scopes,
  contentHash: contentHash(c),
  ...over,
});

describe("canPublish", () => {
  it("sem autorização, base consent não publica", () => {
    expect(canPublish(base(), null).ok).toBe(false);
  });
  it("com autorização dos itens usados, publica", () => {
    const c = base();
    expect(canPublish(c, granted(c, ["name", "images"])).ok).toBe(true);
  });
  it("faltou liberar o nome: bloqueia e diz o quê", () => {
    const c = base();
    const v = canPublish(c, granted(c, ["images"]));
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/nome da empresa/);
  });
  it("mudou o conteúdo depois da autorização: bloqueia", () => {
    const c = base();
    const auth = granted(c, ["name", "images"]);
    expect(canPublish({ ...c, description: "Outra coisa." }, auth).ok).toBe(false);
  });
  it("autorização revogada não publica", () => {
    const c = base();
    expect(canPublish(c, granted(c, ["name", "images"], { status: "revoked" })).ok).toBe(false);
  });
  it("números e depoimento exigem o item liberado", () => {
    const c = base({ metrics: "+40% de pedidos", testimonial: "Ótimo!" });
    expect(neededScopes(c)).toEqual(["name", "images", "numbers", "testimonial"]);
    expect(canPublish(c, granted(c, ["name", "images"])).ok).toBe(false);
    expect(canPublish(c, granted(c, ["name", "images", "numbers", "testimonial"])).ok).toBe(true);
  });
  it("base contrato publica sem pedido, mas nunca com números ou depoimento", () => {
    expect(canPublish(base({ basis: "contract" }), null).ok).toBe(true);
    expect(canPublish(base({ basis: "contract", metrics: "+40%" }), null).ok).toBe(false);
    expect(canPublish(base({ basis: "contract", testimonial: "Ótimo" }), null).ok).toBe(false);
  });
  it("anônimo publica sem pedido", () => {
    expect(canPublish(base({ basis: "anonymous", metrics: "x" }), null).ok).toBe(true);
  });
  it("exige título, descrição e capa", () => {
    expect(canPublish(base({ img: null, basis: "anonymous" }), null).ok).toBe(false);
  });
});

describe("toPublicProject", () => {
  it("anônimo esconde nome, números e depoimento", () => {
    const p = toPublicProject(base({ basis: "anonymous", metrics: "+40%", testimonial: "Ótimo" }));
    expect(p.client).toBe("Cliente confidencial");
    expect(p.metrics).toBeUndefined();
    expect(p.testimonial).toBeUndefined();
  });
  it("com autorização mostra números e depoimento", () => {
    const p = toPublicProject(base({ metrics: "+40%", testimonial: "Ótimo", testimonialAuthor: "Natan" }));
    expect(p.metrics).toBe("+40%");
    expect(p.testimonial).toEqual({ text: "Ótimo", author: "Natan" });
    expect(p.client).toBe("Pará Super Foods");
  });
  it("frente desconhecida cai em audiovisual", () => {
    expect(toPublicProject(base({ service: "x" })).service).toBe("audiovisual");
  });
});

describe("slugify", () => {
  it("tira acento e símbolos", () => {
    expect(slugify("Açaí Norte Mix — Marca!")).toBe("acai-norte-mix-marca");
  });
});
