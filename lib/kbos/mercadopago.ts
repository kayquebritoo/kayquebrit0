// Mercado Pago — verificação HMAC do webhook (esquema oficial) + consulta do pagamento.
//
// Esquema oficial: header `x-signature: ts=<ts>,v1=<hmac>` e header
// `x-request-id`. Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// HMAC-SHA256 hex com MP_WEBHOOK_SECRET, comparado em tempo constante.
import { createHmac, timingSafeEqual } from "crypto";

export function parseSignatureHeader(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  const ts = header.match(/(?:^|,\s*)ts=([^,]+)/)?.[1]?.trim();
  const v1 = header.match(/(?:^|,\s*)v1=([^,]+)/)?.[1]?.trim();
  if (!ts || !v1) return null;
  return { ts, v1 };
}

export function buildManifest(dataId: string, requestId: string, ts: string) {
  return `id:${dataId};request-id:${requestId};ts:${ts};`;
}

export function verifyMpSignature(args: {
  dataId: string;
  requestId: string;
  ts: string;
  v1: string;
  secret: string;
}) {
  const { dataId, requestId, ts, v1, secret } = args;
  if (!dataId || !requestId || !ts || !v1 || !secret) return false;
  const expected = createHmac("sha256", secret).update(buildManifest(dataId, requestId, ts)).digest("hex");
  const a = Buffer.from(v1, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type MpPayment = {
  id: string;
  status: string;
  external_reference: string | null;
};

/** Consulta o pagamento na API do MP (null = sem credencial ou falha). */
export async function fetchMpPayment(paymentId: string, token: string): Promise<MpPayment | null> {
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { id?: unknown; status?: unknown; external_reference?: unknown };
    return {
      id: String(p.id ?? paymentId),
      status: String(p.status ?? ""),
      external_reference: p.external_reference != null ? String(p.external_reference) : null,
    };
  } catch {
    return null;
  }
}

/* ---------- checkout (preferências) ---------- */

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export type PreferenceInput = {
  titulo: string;
  preco: number;
  externalReference: string;
};

/** Corpo da preferência — puro e testável (preço sempre do servidor). */
export function buildPreferenceBody(input: PreferenceInput) {
  const base = appUrl();
  return {
    items: [
      {
        title: input.titulo.slice(0, 200),
        quantity: 1,
        unit_price: Math.round(input.preco * 100) / 100,
        currency_id: "BRL",
      },
    ],
    external_reference: input.externalReference,
    back_urls: {
      success: `${base}/portal/cursos?pagamento=aprovado`,
      failure: `${base}/portal/cursos?pagamento=recusado`,
      pending: `${base}/portal/cursos?pagamento=pendente`,
    },
    auto_return: "approved",
    notification_url: `${base}/api/webhooks/mercadopago`,
  };
}

export type MpPreference = { id: string; init_point: string };

/** Cria a preferência de checkout (null = sem credencial ou falha). */
export async function createMpPreference(
  input: PreferenceInput,
  token: string
): Promise<MpPreference | null> {
  try {
    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildPreferenceBody(input)),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { id?: unknown; init_point?: unknown };
    if (!p.id || !p.init_point) return null;
    return { id: String(p.id), init_point: String(p.init_point) };
  } catch {
    return null;
  }
}
