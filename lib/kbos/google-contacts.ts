// Google Contatos (People API) → registros de importação. O token é usado na hora e descartado (nunca é guardado).
import { canonPhone, cleanEmail, cleanFacebook, cleanInstagram, type ImportRecord } from "./contact-import";

export const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const PERSON_FIELDS = "names,phoneNumbers,emailAddresses,photos,organizations,urls,userDefined,metadata";

type GPerson = {
  resourceName?: string;
  names?: { displayName?: string }[];
  phoneNumbers?: { value?: string; canonicalForm?: string }[];
  emailAddresses?: { value?: string }[];
  photos?: { url?: string; default?: boolean }[];
  organizations?: { name?: string; title?: string }[];
  urls?: { value?: string }[];
  userDefined?: { key?: string; value?: string }[];
};

export function googlePersonToRecord(p: GPerson): ImportRecord | null {
  const rec: ImportRecord = { name: (p.names?.[0]?.displayName || "").trim(), phones: [], emails: [], source: "google", externalId: p.resourceName ?? null };
  for (const ph of p.phoneNumbers ?? []) { const c = canonPhone(ph.canonicalForm || ph.value); if (c) rec.phones.push({ number: c, source: "google" }); }
  for (const e of p.emailAddresses ?? []) { const v = cleanEmail(e.value); if (v) rec.emails.push(v); }
  const photo = (p.photos ?? []).find((x) => x.url && !x.default);
  rec.photoUrl = photo?.url && /^https?:\/\//.test(photo.url) ? photo.url : null;
  rec.company = p.organizations?.[0]?.name || null;
  rec.role = p.organizations?.[0]?.title || null;
  for (const u of p.urls ?? []) {
    if (/instagram\.com/i.test(u.value || "")) rec.instagram = rec.instagram ?? cleanInstagram(u.value);
    else if (/facebook\.com/i.test(u.value || "")) rec.facebook = rec.facebook ?? cleanFacebook(u.value);
    else if (!rec.website && /^https?:\/\//.test(u.value || "")) rec.website = u.value!;
  }
  for (const d of p.userDefined ?? []) {
    if (/insta/i.test(d.key || "")) rec.instagram = rec.instagram ?? cleanInstagram(d.value);
    if (/face/i.test(d.key || "")) rec.facebook = rec.facebook ?? cleanFacebook(d.value);
  }
  return rec.name || rec.phones.length || rec.emails.length ? rec : null;
}

/** Busca todos os contatos do Google da conta autorizada (paginado). */
export async function fetchGoogleContacts(accessToken: string, max = 5000): Promise<ImportRecord[]> {
  const out: ImportRecord[] = [];
  let token = "";
  for (let page = 0; page < 10 && out.length < max; page++) {
    const url = `https://people.googleapis.com/v1/people/me/connections?personFields=${PERSON_FIELDS}&pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Google respondeu ${res.status} ao listar contatos.`);
    const j = (await res.json()) as { connections?: GPerson[]; nextPageToken?: string };
    for (const p of j.connections ?? []) { const r = googlePersonToRecord(p); if (r) out.push(r); }
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  return out.slice(0, max);
}
