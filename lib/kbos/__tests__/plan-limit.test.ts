import { describe, expect, it } from "vitest";
import { effectivePostLimit } from "../plan-limit";

describe("effectivePostLimit", () => {
  it("usa o valor do plano quando existe", () => expect(effectivePostLimit("social", 30)).toBe(30));
  it("0 significa sem limite", () => expect(effectivePostLimit("social", 0)).toBeNull());
  it("sem valor: 50 em redes sociais", () => expect(effectivePostLimit("social", null)).toBe(50));
  it("sem valor: sem limite nos demais", () => expect(effectivePostLimit("marca", null)).toBeNull());
});
