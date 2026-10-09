// Unitários do HMAC do Mercado Pago — vetor fixo + adulterações.
import { describe, expect, it } from "vitest";
import {
  buildManifest,
  parseSignatureHeader,
  verifyMpSignature,
} from "../mercadopago";

// Vetor gerado com: HMAC-SHA256("segredo-teste-kbos", "id:223355;request-id:req-abc-123;ts:1704908010;")
const SECRET = "segredo-teste-kbos";
const DATA_ID = "223355";
const REQ_ID = "req-abc-123";
const TS = "1704908010";
const V1 = "23fcd1001a5b7d6b3ef302555f2fb5ee2c18998a804b5a81ed75daf7fc95a23f";

describe("buildManifest", () => {
  it("monta o manifesto exato do esquema oficial", () => {
    expect(buildManifest(DATA_ID, REQ_ID, TS)).toBe(
      "id:223355;request-id:req-abc-123;ts:1704908010;"
    );
  });
});

describe("parseSignatureHeader", () => {
  it("extrai ts e v1 (com e sem espaços)", () => {
    expect(parseSignatureHeader(`ts=${TS},v1=${V1}`)).toEqual({ ts: TS, v1: V1 });
    expect(parseSignatureHeader(`ts=${TS}, v1=${V1}`)).toEqual({ ts: TS, v1: V1 });
  });
  it("retorna null quando incompleto", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader(`ts=${TS}`)).toBeNull();
    expect(parseSignatureHeader("lixo")).toBeNull();
  });
});

describe("verifyMpSignature", () => {
  const good = { dataId: DATA_ID, requestId: REQ_ID, ts: TS, v1: V1, secret: SECRET };
  it("aceita a assinatura correta", () => {
    expect(verifyMpSignature(good)).toBe(true);
  });
  it("rejeita qualquer adulteração (ts, v1, dataId, requestId, secret)", () => {
    expect(verifyMpSignature({ ...good, ts: "1704908011" })).toBe(false);
    expect(verifyMpSignature({ ...good, v1: `${V1.slice(0, -1)}0` })).toBe(false);
    expect(verifyMpSignature({ ...good, v1: V1.slice(0, 32) })).toBe(false);
    expect(verifyMpSignature({ ...good, dataId: "223356" })).toBe(false);
    expect(verifyMpSignature({ ...good, requestId: "outro" })).toBe(false);
    expect(verifyMpSignature({ ...good, secret: "outro-segredo" })).toBe(false);
  });
  it("rejeita campos vazios", () => {
    expect(verifyMpSignature({ ...good, v1: "" })).toBe(false);
    expect(verifyMpSignature({ ...good, secret: "" })).toBe(false);
  });
});
