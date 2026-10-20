import { describe, expect, it } from "vitest";
import { googlePersonToRecord } from "../google-contacts";

describe("Google Contatos → registro", () => {
  it("converte nome, números, e-mails, foto real, empresa e redes", () => {
    const r = googlePersonToRecord({
      resourceName: "people/c1",
      names: [{ displayName: "Thalita Souza" }],
      phoneNumbers: [{ value: "(91) 98888-7777", canonicalForm: "+5591988887777" }, { value: "91 3333-4444" }],
      emailAddresses: [{ value: "T@X.com" }],
      photos: [{ url: "https://lh3/default.jpg", default: true }, { url: "https://lh3/real.jpg" }],
      organizations: [{ name: "Atalaia Vip", title: "Gerente" }],
      urls: [{ value: "https://instagram.com/thalita.vip" }, { value: "https://atalaia.com" }],
    });
    expect(r).toMatchObject({ name: "Thalita Souza", externalId: "people/c1", emails: ["t@x.com"], photoUrl: "https://lh3/real.jpg", company: "Atalaia Vip", role: "Gerente", instagram: "@thalita.vip", website: "https://atalaia.com", source: "google" });
    expect(r!.phones.map((p) => p.number)).toEqual(["5591988887777", "559133334444"]);
  });
  it("ignora contato vazio e foto padrão", () => {
    expect(googlePersonToRecord({})).toBeNull();
    expect(googlePersonToRecord({ names: [{ displayName: "A" }], photos: [{ url: "https://x/d.jpg", default: true }] })!.photoUrl).toBeNull();
  });
});
