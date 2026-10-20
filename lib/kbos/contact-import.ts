// Importação de contatos (Google, WhatsApp, arquivo vCard/CSV): normaliza, agrupa a mesma pessoa vinda de
// fontes diferentes, casa com o que já existe (telefone/e-mail/@) e decide qual número é o ATUAL.
// Tudo aqui é puro (sem rede/banco) para poder ser testado; o banco fica em contact-import-db.ts.
import { phoneKey } from "./contact-dupes";

export type ImportSource = "google" | "whatsapp" | "arquivo";
export type PhoneIn = { number: string; source: ImportSource; onWhatsapp?: boolean | null };
export type ImportRecord = {
  name: string;
  phones: PhoneIn[];
  emails: string[];
  photoUrl?: string | null;
  company?: string | null;
  role?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  website?: string | null;
  source: ImportSource;
  externalId?: string | null;
};
export type ExistingContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  photoUrl: string | null;
  status: string;
  extraEmails: string[];
  formerPhones: string[];
  externalIds: Record<string, string>;
};

// ── normalização ────────────────────────────────────────────────────────────
/** Telefone BR → só dígitos com DDI 55; null se não parecer um telefone. */
export function canonPhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^\d{12,15}$/.test(full) ? full : null;
}
export const cleanEmail = (raw: string | null | undefined): string | null => {
  const e = (raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};
/** "@fulano", "instagram.com/fulano/" ou "fulano" → "@fulano". */
export function cleanInstagram(raw: string | null | undefined): string | null {
  let v = (raw || "").trim();
  if (!v) return null;
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(v);
  if (m) v = m[1];
  v = v.replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? `@${v.toLowerCase()}` : null;
}
export function cleanFacebook(raw: string | null | undefined): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const m = /facebook\.com\/(?:profile\.php\?id=)?([A-Za-z0-9._-]+)/i.exec(v);
  if (m) return `facebook.com/${m[1]}`;
  return /^[A-Za-z0-9._-]{3,60}$/.test(v) ? `facebook.com/${v}` : null;
}
const httpUrl = (raw: string | null | undefined) => (/^https?:\/\/\S+$/i.test((raw || "").trim()) ? (raw as string).trim() : null);

// ── vCard (.vcf) ────────────────────────────────────────────────────────────
export function parseVCard(text: string, source: ImportSource = "arquivo"): ImportRecord[] {
  const unfolded = text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "");
  const out: ImportRecord[] = [];
  for (const block of unfolded.split(/BEGIN:VCARD/i).slice(1)) {
    const rec: ImportRecord = { name: "", phones: [], emails: [], source };
    let n = "";
    for (const line of block.split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const head = line.slice(0, i).replace(/^item\d+\./i, "");
      const value = line.slice(i + 1).trim();
      const [prop, ...params] = head.split(";");
      const P = prop.toUpperCase();
      const par = params.join(";").toLowerCase();
      if (!value) continue;
      if (P === "FN") rec.name = value;
      else if (P === "N") n = value.split(";").filter(Boolean).reverse().join(" ").trim();
      else if (P === "TEL") { const c = canonPhone(value); if (c) rec.phones.push({ number: c, source }); }
      else if (P === "EMAIL") { const e = cleanEmail(value); if (e) rec.emails.push(e); }
      else if (P === "ORG") rec.company = value.split(";")[0] || null;
      else if (P === "TITLE") rec.role = value;
      else if (P === "PHOTO") { const u = httpUrl(value); if (u) rec.photoUrl = u; }
      else if (P === "URL") {
        if (/instagram\.com/i.test(value)) rec.instagram = cleanInstagram(value);
        else if (/facebook\.com/i.test(value)) rec.facebook = cleanFacebook(value);
        else if (!rec.website) rec.website = httpUrl(value);
      } else if (P === "X-SOCIALPROFILE" || P === "X-INSTAGRAM" || P === "X-FACEBOOK") {
        if (/instagram/.test(par) || P === "X-INSTAGRAM" || /instagram\.com/i.test(value)) rec.instagram = cleanInstagram(value);
        else if (/facebook/.test(par) || P === "X-FACEBOOK" || /facebook\.com/i.test(value)) rec.facebook = cleanFacebook(value);
      } else if (P === "UID") rec.externalId = value;
    }
    rec.name = (rec.name || n).trim();
    if (rec.name || rec.phones.length || rec.emails.length) out.push(rec);
  }
  return out;
}

// ── CSV (Google Contatos, planilhas simples) ────────────────────────────────
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const src = text.replace(/^﻿/, "");
  const delim = (src.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (src.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const split = (v: string) => v.split(/\s*:::\s*/).map((x) => x.trim()).filter(Boolean);

export function parseCsv(text: string, source: ImportSource = "arquivo"): ImportRecord[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const head = rows[0].map(norm);
  const idx = (re: RegExp) => head.map((h, i) => (re.test(h) && !/label|type|tipo/.test(h) ? i : -1)).filter((i) => i >= 0);
  const cName = idx(/^(name|nome|nome completo|display name)$/), cFirst = idx(/^(first name|given name|primeiro nome)$/), cMid = idx(/^(middle name)$/), cLast = idx(/^(last name|family name|sobrenome)$/);
  const cPhone = idx(/(phone|telefone|celular|whatsapp|mobile|fone)/), cMail = idx(/(e-?mail)/), cOrg = idx(/^(organization( 1)? - name|organization name|company|empresa|organizacao)$/);
  const cTitle = idx(/(organization( 1)? - title|organization title|cargo|job title)/), cPhoto = idx(/^(photo|foto)$/), cIg = idx(/instagram/), cFb = idx(/facebook/), cSite = idx(/(website|site|url)/);
  const get = (r: string[], cols: number[]) => cols.map((i) => r[i] || "").filter(Boolean);
  const out: ImportRecord[] = [];
  for (const r of rows.slice(1)) {
    const full = get(r, cName)[0] || [get(r, cFirst)[0], get(r, cMid)[0], get(r, cLast)[0]].filter(Boolean).join(" ");
    const rec: ImportRecord = { name: full.trim(), phones: [], emails: [], source, company: get(r, cOrg)[0] || null, role: get(r, cTitle)[0] || null };
    for (const v of get(r, cPhone).flatMap(split)) { const c = canonPhone(v); if (c) rec.phones.push({ number: c, source }); }
    for (const v of get(r, cMail).flatMap(split)) { const e = cleanEmail(v); if (e) rec.emails.push(e); }
    rec.photoUrl = httpUrl(get(r, cPhoto)[0]);
    rec.instagram = cleanInstagram(get(r, cIg)[0]);
    rec.facebook = cleanFacebook(get(r, cFb)[0]);
    const site = get(r, cSite).flatMap(split).find((u) => httpUrl(u) && !/instagram|facebook/i.test(u));
    rec.website = site ? httpUrl(site) : null;
    if (rec.name || rec.phones.length || rec.emails.length) out.push(rec);
  }
  return out;
}

/** Detecta o formato pelo conteúdo e converte. */
export function parseContactFile(text: string, source: ImportSource = "arquivo"): ImportRecord[] {
  return /BEGIN:VCARD/i.test(text) ? parseVCard(text, source) : parseCsv(text, source);
}

// ── chaves de identidade ────────────────────────────────────────────────────
const recKeys = (r: ImportRecord): string[] => [
  ...r.phones.map((p) => phoneKey(p.number)).filter(Boolean).map((k) => `p:${k}`),
  ...r.emails.map((e) => `e:${e}`),
  ...(r.instagram ? [`i:${r.instagram}`] : []),
  ...(r.externalId ? [`x:${r.source}:${r.externalId}`] : []),
];
const exKeys = (c: ExistingContact): string[] => [
  ...[c.phone, ...c.formerPhones].map((p) => phoneKey(p)).filter(Boolean).map((k) => `p:${k}`),
  ...[c.email, ...c.extraEmails].map(cleanEmail).filter(Boolean).map((e) => `e:${e}`),
  ...(c.instagram ? [`i:${c.instagram.toLowerCase()}`] : []),
  ...Object.entries(c.externalIds).map(([s, id]) => `x:${s}:${id}`),
];

// ── qual número é o ATUAL ───────────────────────────────────────────────────
const RANK: Record<string, number> = { whatsapp: 3, existente: 2, google: 1, arquivo: 1 };
export type PhoneDecision = { primary: string | null; former: string[]; reason: "whatsapp" | "fonte" | "unico" | "nenhum"; needsReview: boolean };

/** Escolhe o número atual entre o que já existe e o que chegou. Quem está no WhatsApp vence; sem verificação, vale a fonte
 *  (conversa real > cadastro existente > Google/arquivo). Os outros viram "antigos": saem da ficha, mas ficam guardados só para
 *  reconhecer a mesma pessoa numa próxima importação. */
export function decidePhones(existingPrimary: string | null, existingFormer: string[], incoming: PhoneIn[], verified: Record<string, boolean | null> = {}): PhoneDecision {
  type C = { number: string; onWhatsapp: boolean | null; rank: number };
  const byKey = new Map<string, C>();
  const add = (number: string, onWhatsapp: boolean | null, rank: number) => {
    const n = canonPhone(number);
    const k = n && phoneKey(n);
    if (!n || !k) return;
    onWhatsapp = onWhatsapp ?? verified[n] ?? null;
    const prev = byKey.get(k);
    if (!prev) byKey.set(k, { number: n, onWhatsapp, rank });
    else byKey.set(k, { number: prev.number, onWhatsapp: onWhatsapp ?? prev.onWhatsapp, rank: Math.max(prev.rank, rank) });
  };
  if (existingPrimary) add(existingPrimary, null, RANK.existente);
  for (const p of incoming) add(p.number, p.onWhatsapp ?? null, RANK[p.source] ?? 1);
  const all = [...byKey.values()];
  const formerKeep = existingFormer.map((f) => canonPhone(f) || f);
  if (all.length === 0) return { primary: null, former: formerKeep, reason: "nenhum", needsReview: false };
  if (all.length === 1) return { primary: all[0].number, former: formerKeep, reason: "unico", needsReview: false };
  const verified = all.filter((c) => c.onWhatsapp === true);
  let pool = verified.length ? verified : all.filter((c) => c.onWhatsapp !== false);
  if (!pool.length) pool = all;
  const top = Math.max(...pool.map((c) => c.rank));
  const best = pool.filter((c) => c.rank === top);
  const chosen = best.find((c) => c.number === canonPhone(existingPrimary || "")) ?? best[0];
  const reason = verified.length ? "whatsapp" : "fonte";
  const needsReview = verified.length ? verified.length > 1 && best.length > 1 : best.length > 1 || all.length > 1;
  const former = [...new Set([...formerKeep, ...all.filter((c) => c !== chosen).map((c) => c.number)])].filter((n) => n !== chosen.number);
  return { primary: chosen.number, former, reason, needsReview: needsReview && !(verified.length === 1) };
}

// ── agrupar + casar + planejar ──────────────────────────────────────────────
export type PlanPatch = Partial<{ name: string; email: string; phone: string | null; company: string; role: string; instagram: string; facebook: string; website: string; photoUrl: string; extraEmails: string[]; formerPhones: string[]; externalIds: Record<string, string>; source: string }>;
export type PlanItem = {
  id: string;
  action: "create" | "merge" | "conflict";
  person: ImportRecord & { sources: ImportSource[] };
  targetId?: string;
  targetName?: string;
  conflictIds?: string[];
  patch: PlanPatch;
  phone: PhoneDecision;
  changes: string[];
};

const looksLikeNumber = (n: string) => !n.trim() || /^\+?[\d\s()-]{6,}$/.test(n.trim());
const better = (a: string | null | undefined, b: string | null | undefined) => a || b || null;

function mergeRecords(a: ImportRecord & { sources: ImportSource[] }, b: ImportRecord): ImportRecord & { sources: ImportSource[] } {
  const seen = new Set(a.phones.map((p) => phoneKey(p.number)));
  const phones = [...a.phones];
  for (const p of b.phones) {
    const k = phoneKey(p.number);
    const i = phones.findIndex((x) => phoneKey(x.number) === k);
    if (i < 0 && !seen.has(k)) { phones.push(p); seen.add(k); }
    else if (i >= 0 && (p.onWhatsapp ?? null) !== null) phones[i] = { ...phones[i], onWhatsapp: p.onWhatsapp };
  }
  return {
    ...a,
    name: looksLikeNumber(a.name) && !looksLikeNumber(b.name) ? b.name : a.name,
    phones,
    emails: [...new Set([...a.emails, ...b.emails])],
    photoUrl: better(a.photoUrl, b.photoUrl),
    company: better(a.company, b.company),
    role: better(a.role, b.role),
    instagram: better(a.instagram, b.instagram),
    facebook: better(a.facebook, b.facebook),
    website: better(a.website, b.website),
    externalId: a.externalId ?? b.externalId,
    sources: [...new Set([...a.sources, b.source])],
  };
}

export function planImport(records: ImportRecord[], existing: ExistingContact[], verified: Record<string, boolean | null> = {}): PlanItem[] {
  // 1) a mesma pessoa vinda de fontes diferentes vira uma só (união por chaves em comum)
  const parent = records.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map<string, number>();
  records.forEach((r, i) => { for (const k of recKeys(r)) { const o = owner.get(k); if (o === undefined) owner.set(k, i); else parent[find(i)] = find(o); } });
  const groups = new Map<number, number[]>();
  records.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const people = [...groups.values()].map((ix) => ix.map((i) => records[i]).reduce<(ImportRecord & { sources: ImportSource[] }) | null>((acc, r) => (acc ? mergeRecords(acc, r) : { ...r, sources: [r.source] }), null)!);

  // 2) casar com os contatos existentes
  const byKey = new Map<string, Set<string>>();
  for (const c of existing) for (const k of exKeys(c)) byKey.set(k, new Set([...(byKey.get(k) ?? []), c.id]));
  const byId = new Map(existing.map((c) => [c.id, c]));

  return people.map((person, n): PlanItem => {
    const hits = new Set<string>();
    for (const k of recKeys(person)) for (const id of byKey.get(k) ?? []) hits.add(id);
    const id = `p${n}`;
    if (hits.size > 1) {
      return { id, action: "conflict", person, conflictIds: [...hits], patch: {}, phone: decidePhones(null, [], person.phones), changes: ["Combina com mais de um contato: junte-os primeiro em Duplicados."] };
    }
    const target = hits.size === 1 ? byId.get([...hits][0]) : undefined;
    if (!target) {
      const phone = decidePhones(null, [], person.phones, verified);
      const patch: PlanPatch = {
        name: person.name || person.emails[0] || phone.primary || "Sem nome",
        phone: phone.primary, formerPhones: phone.former, source: person.sources[0],
        ...(person.emails[0] ? { email: person.emails[0] } : {}), ...(person.emails.length > 1 ? { extraEmails: person.emails.slice(1) } : {}),
        ...(person.company ? { company: person.company } : {}), ...(person.role ? { role: person.role } : {}),
        ...(person.instagram ? { instagram: person.instagram } : {}), ...(person.facebook ? { facebook: person.facebook } : {}),
        ...(person.website ? { website: person.website } : {}), ...(person.photoUrl ? { photoUrl: person.photoUrl } : {}),
        ...(person.externalId ? { externalIds: { [person.source]: person.externalId } } : {}),
      };
      return { id, action: "create", person, patch, phone, changes: ["Contato novo"] };
    }
    // 3) mesclar no existente: só completa o que falta; troca o número se o novo for o atual
    const phone = decidePhones(target.phone, target.formerPhones, person.phones, verified);
    const patch: PlanPatch = {};
    const changes: string[] = [];
    if (looksLikeNumber(target.name) && person.name && !looksLikeNumber(person.name)) { patch.name = person.name; changes.push(`Nome: ${person.name}`); }
    const allEmails = [...new Set([target.email, ...target.extraEmails, ...person.emails].map(cleanEmail).filter(Boolean) as string[])];
    if (!target.email && allEmails[0]) { patch.email = allEmails[0]; changes.push(`E-mail: ${allEmails[0]}`); }
    const extra = allEmails.filter((e) => e !== (patch.email ?? target.email));
    if (extra.join() !== target.extraEmails.join()) patch.extraEmails = extra;
    for (const [k, v, label] of [["company", person.company, "Empresa"], ["role", person.role, "Cargo"], ["instagram", person.instagram, "Instagram"], ["facebook", person.facebook, "Facebook"], ["website", person.website, "Site"], ["photoUrl", person.photoUrl, "Foto"]] as const) {
      if (v && !target[k]) { (patch as Record<string, string>)[k] = v; changes.push(`${label}: ${k === "photoUrl" ? "nova" : v}`); }
    }
    if (phone.primary && phone.primary !== canonPhone(target.phone || "")) {
      patch.phone = phone.primary;
      changes.push(target.phone ? `Número atual: ${phone.primary} (antigo ${target.phone} saiu da ficha)` : `Telefone: ${phone.primary}`);
    }
    if (phone.former.join() !== target.formerPhones.join()) patch.formerPhones = phone.former;
    if (person.externalId) patch.externalIds = { ...target.externalIds, [person.source]: person.externalId };
    return { id, action: "merge", person, targetId: target.id, targetName: target.name, patch, phone, changes: changes.length ? changes : ["Sem novidades"] };
  });
}
