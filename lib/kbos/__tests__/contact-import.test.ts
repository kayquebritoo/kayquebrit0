import { describe, expect, it } from "vitest";
import { canonPhone, cleanFacebook, cleanInstagram, decidePhones, parseContactFile, parseCsv, parseVCard, planImport, type ExistingContact } from "../contact-import";

const ex = (o: Partial<ExistingContact> = {}): ExistingContact => ({ id: "c1", name: "Thalita Souza", email: null, phone: "5591988887777", company: null, role: null, instagram: null, facebook: null, website: null, photoUrl: null, status: "client", extraEmails: [], formerPhones: [], externalIds: {}, ...o });

describe("normalização", () => {
  it("telefone brasileiro vira dígitos com 55", () => {
    expect(canonPhone("(91) 98888-7777")).toBe("5591988887777");
    expect(canonPhone("+55 91 3333-4444")).toBe("559133334444");
    expect(canonPhone("12345")).toBeNull();
  });
  it("instagram e facebook de URL ou @", () => {
    expect(cleanInstagram("https://www.instagram.com/Kayque.Brito/?hl=pt")).toBe("@kayque.brito");
    expect(cleanInstagram("@Marca")).toBe("@marca");
    expect(cleanInstagram("não é um @ válido!!")).toBeNull();
    expect(cleanFacebook("https://facebook.com/fulano.tal")).toBe("facebook.com/fulano.tal");
  });
});

describe("vCard", () => {
  const vcf = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Thalita Souza\r\nN:Souza;Thalita;;;\r\nTEL;TYPE=CELL:(91) 98888-7777\r\nitem1.TEL:+55 91 3333-4444\r\nEMAIL;TYPE=INTERNET:Thalita@Example.com\r\nORG:Atalaia Vip;\r\nTITLE:Gerente\r\nPHOTO;VALUE=uri:https://exemplo.com/foto.jpg\r\nX-SOCIALPROFILE;type=instagram:https://instagram.com/thalita.vip\r\nURL:https://atalaia.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nN:Silva;Ana;;;\r\nTEL:91977776666\r\nEND:VCARD`;
  it("lê nome, telefones, e-mail, empresa, foto e redes", () => {
    const [a, b] = parseVCard(vcf);
    expect(a).toMatchObject({ name: "Thalita Souza", company: "Atalaia Vip", role: "Gerente", photoUrl: "https://exemplo.com/foto.jpg", instagram: "@thalita.vip", website: "https://atalaia.com", emails: ["thalita@example.com"] });
    expect(a.phones.map((p) => p.number)).toEqual(["5591988887777", "559133334444"]);
    expect(b.name).toBe("Ana Silva");
    expect(b.phones[0].number).toBe("5591977776666");
  });
  it("dobra de linha (linha começando com espaço) é desfeita", () => {
    expect(parseVCard("BEGIN:VCARD\nFN:Nome Muito\n  Longo\nEND:VCARD")[0].name).toBe("Nome Muito Longo");
  });
});

describe("CSV", () => {
  it("formato do Google Contatos (vários telefones com :::)", () => {
    const csv = `First Name,Last Name,Organization Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Photo\nThalita,Souza,Atalaia Vip,Work,t@x.com,Mobile,(91) 98888-7777 ::: (91) 97777-6666,https://x.com/p.jpg\n`;
    const [r] = parseCsv(csv, "google");
    expect(r).toMatchObject({ name: "Thalita Souza", company: "Atalaia Vip", emails: ["t@x.com"], photoUrl: "https://x.com/p.jpg", source: "google" });
    expect(r.phones.map((p) => p.number)).toEqual(["5591988887777", "5591977776666"]);
  });
  it("planilha simples em português com ponto e vírgula e aspas", () => {
    const [r] = parseContactFile(`Nome;Telefone;E-mail;Instagram\n"Souza; Thalita";91 98888-7777;t@x.com;@thalita\n`);
    expect(r.name).toBe("Souza; Thalita");
    expect(r.phones[0].number).toBe("5591988887777");
    expect(r.instagram).toBe("@thalita");
  });
  it("detecta vCard pelo conteúdo", () => {
    expect(parseContactFile("BEGIN:VCARD\nFN:A\nTEL:91988887777\nEND:VCARD")).toHaveLength(1);
  });
});

describe("qual é o número atual", () => {
  it("quem está no WhatsApp vence e o outro vira antigo", () => {
    const d = decidePhones("5591988887777", [], [{ number: "5591977776666", source: "google", onWhatsapp: true }, { number: "5591988887777", source: "google", onWhatsapp: false }]);
    expect(d.primary).toBe("5591977776666");
    expect(d.former).toContain("5591988887777");
    expect(d.reason).toBe("whatsapp");
    expect(d.needsReview).toBe(false);
  });
  it("sem verificação: conversa real do WhatsApp vence cadastro; pede conferência", () => {
    const d = decidePhones("5591988887777", [], [{ number: "5591977776666", source: "whatsapp" }]);
    expect(d.primary).toBe("5591977776666");
    expect(d.needsReview).toBe(true);
  });
  it("sem verificação: o cadastro existente vence um número só do Google", () => {
    const d = decidePhones("5591988887777", [], [{ number: "5591977776666", source: "google" }]);
    expect(d.primary).toBe("5591988887777");
    expect(d.former).toEqual(["5591977776666"]);
  });
  it("o mesmo número em formatos diferentes é um só (e o 9 extra do celular)", () => {
    const d = decidePhones("5591988887777", [], [{ number: "(91) 8888-7777", source: "google" }]);
    expect(d.former).toEqual([]);
    expect(d.needsReview).toBe(false);
  });
  it("número antigo já guardado continua guardado", () => {
    expect(decidePhones("5591988887777", ["5591911112222"], []).former).toEqual(["5591911112222"]);
  });
});

describe("plano de importação", () => {
  it("contato novo", () => {
    const [p] = planImport(parseVCard("BEGIN:VCARD\nFN:Ana\nTEL:91977776666\nEND:VCARD", "google"), []);
    expect(p.action).toBe("create");
    expect(p.patch).toMatchObject({ name: "Ana", phone: "5591977776666", source: "google" });
  });
  it("mesma pessoa em Google e WhatsApp vira uma só, com o número do WhatsApp", () => {
    const g = parseCsv("Name,Phone 1 - Value,E-mail 1 - Value,Photo\nThalita,(91) 98888-7777,t@x.com,https://x.com/p.jpg", "google");
    const w = [{ name: "91 98888-7777", phones: [{ number: "5591988887777", source: "whatsapp" as const }], emails: [], source: "whatsapp" as const, photoUrl: "https://wa/p.jpg" }];
    const plan = planImport([...g, ...w], []);
    expect(plan).toHaveLength(1);
    expect(plan[0].person.name).toBe("Thalita");
    expect(plan[0].person.sources.sort()).toEqual(["google", "whatsapp"]);
    expect(plan[0].patch.photoUrl).toBe("https://x.com/p.jpg");
  });
  it("casa com o existente pelo telefone mesmo com formato diferente e só completa o que falta", () => {
    const [p] = planImport(parseCsv("Name,Phone 1 - Value,E-mail 1 - Value,Organization Name\nThalita S.,(91) 8888-7777,t@x.com,Atalaia Vip", "google"), [ex()]);
    expect(p.action).toBe("merge");
    expect(p.targetId).toBe("c1");
    expect(p.patch.name).toBeUndefined();
    expect(p.patch).toMatchObject({ email: "t@x.com", company: "Atalaia Vip" });
    expect(p.patch.phone).toBeUndefined();
  });
  it("nome que era só o número é trocado pelo nome real", () => {
    const [p] = planImport(parseCsv("Name,Phone 1 - Value\nThalita,(91) 98888-7777", "google"), [ex({ name: "5591988887777" })]);
    expect(p.patch.name).toBe("Thalita");
  });
  it("número novo do WhatsApp substitui o antigo e guarda o antigo só para reconhecer", () => {
    const rec = [{ name: "Thalita", phones: [{ number: "5591977776666", source: "whatsapp" as const, onWhatsapp: true }], emails: ["t@x.com"], source: "whatsapp" as const }];
    const [p] = planImport(rec, [ex({ email: "t@x.com" })]);
    expect(p.action).toBe("merge");
    expect(p.patch.phone).toBe("5591977776666");
    expect(p.patch.formerPhones).toEqual(["5591988887777"]);
  });
  it("combina com dois contatos: conflito (não escolhe sozinho)", () => {
    const plan = planImport([{ name: "X", phones: [{ number: "5591988887777", source: "google" }], emails: ["b@x.com"], source: "google" }], [ex({ id: "c1" }), ex({ id: "c2", phone: "5591900000000", email: "b@x.com" })]);
    expect(plan[0].action).toBe("conflict");
    expect(plan[0].conflictIds?.sort()).toEqual(["c1", "c2"]);
  });
  it("número antigo guardado reconhece a pessoa e não duplica", () => {
    const [p] = planImport([{ name: "Thalita", phones: [{ number: "5591911112222", source: "google" }], emails: [], source: "google" }], [ex({ formerPhones: ["5591911112222"] })]);
    expect(p.action).toBe("merge");
  });
  it("verificação do WhatsApp decide também sobre o número já cadastrado", () => {
    const rec = [{ name: "Thalita", phones: [{ number: "5591977776666", source: "google" as const }], emails: [], source: "google" as const }];
    const [p] = planImport(rec, [ex({ phone: "5591988887777", email: null, externalIds: {}, formerPhones: ["5591977776666"] })], { "5591988887777": false, "5591977776666": true });
    expect(p.patch.phone).toBe("5591977776666");
    expect(p.patch.formerPhones).toEqual(["5591988887777"]);
  });
});
