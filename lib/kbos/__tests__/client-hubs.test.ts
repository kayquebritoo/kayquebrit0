import { hubFor, lumeHref } from "../client-hubs";

describe("hub do cliente (Grupo VIP)", () => {
  it("reconhece o cliente pelo nome ou pela empresa", () => {
    expect(hubFor("Atalaia VIP Hotel")?.id).toBe("grupo-vip");
    expect(hubFor("Maria", "Grupo VIP")?.id).toBe("grupo-vip");
    expect(hubFor(null, "Atalaia Lounge")?.id).toBe("grupo-vip");
  });
  it("não cria hub para outros clientes", () => {
    expect(hubFor("Açaí Norte Mix")).toBeNull();
    expect(hubFor(null, undefined)).toBeNull();
  });
  it("monta o link do Lume filtrado por empresa", () => {
    expect(lumeHref()).toBe("/api/admin/lume/entrar");
    expect(lumeHref("Praça")).toBe("/api/admin/lume/entrar?pasta=Pra%C3%A7a");
  });
});
