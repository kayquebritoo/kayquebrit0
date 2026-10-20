// Calendário de conteúdo: lê o .ics exportado do mLabs e vira "posts" do KBOS.
// Só interpreta o arquivo (sem banco). Roteiros ficam em `script`; textos de legenda de posts já
// agendados (com horário) ficam em `caption`. Itens iguais no mesmo dia (mesma arte em várias redes)
// viram um só, com `copies`.
import { createHash } from "node:crypto";

export const POST_FORMATS = ["reels", "carrossel", "estatico", "story", "outro"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];
export const POST_STATUS = ["roteiro", "captacao", "producao", "aprovacao", "ajustes", "aprovado", "agendado", "postado", "erro"] as const;
export type PostStatus = (typeof POST_STATUS)[number];

export type ParsedPost = {
  key: string;
  title: string;
  brand: string | null;
  format: PostFormat;
  scheduledAt: Date;
  hasTime: boolean;
  status: PostStatus;
  script: string | null;
  caption: string | null;
  copies: number;
};

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const unescapeIcs = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");

/** DTSTART "20261003T000000" (horário de Belém, sem fuso) ou "...Z" (UTC) → Date. */
export function parseIcsDate(raw: string): { date: Date; hasTime: boolean } | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", , z] = m;
  const iso = z ? `${y}-${mo}-${d}T${hh}:${mm}:00Z` : `${y}-${mo}-${d}T${hh}:${mm}:00-03:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { date, hasTime: !(hh === "00" && mm === "00") };
}

export function detectBrand(summary: string, description: string): string | null {
  const text = `${summary} ${description.slice(0, 200)}`;
  if (/\bhotel\b/i.test(text)) return "Hotel";
  if (/\blounge\b/i.test(text)) return "Lounge";
  if (/\bpra[cç]a\b/i.test(text)) return "Praça";
  return null;
}

export function detectFormat(summary: string, description: string): PostFormat {
  const t = strip(`${summary} ${description.slice(0, 160)}`);
  if (/\breels?\b/.test(t)) return "reels";
  if (/carross/.test(t)) return "carrossel";
  if (/\bstor(y|ies)\b/.test(t)) return "story";
  if (/flyer|estatic|\barte\b/.test(t)) return "estatico";
  return "outro";
}

/** "000 HOTEL- Reels Círio" → "Círio" (tira prefixo de marca/formato e traços). */
export function cleanTitle(summary: string): string {
  let t = summary.trim().replace(/^0+\s*/, "");
  t = t.replace(/^(hotel|lounge|pra[cç]a)\s*[-–—:]*\s*/i, "");
  t = t.replace(/^(reels?|carrossel|story|stories|flyer|est[aá]tico)\s*[-–—:]*\s*/i, "");
  t = t.trim();
  return t || summary.trim() || "Sem título";
}

function unfold(text: string) {
  return text.replace(/\r?\n[ \t]/g, "").replace(/\r/g, "");
}

export function parseIcs(text: string, projectKey = ""): ParsedPost[] {
  const events = [...unfold(text).matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map((m) => m[1]);
  const byKey = new Map<string, ParsedPost>();
  for (const ev of events) {
    const f: Record<string, string> = {};
    for (const line of ev.split("\n")) {
      const i = line.indexOf(":");
      if (i < 1) continue;
      const name = line.slice(0, i).split(";")[0].toUpperCase();
      if (!(name in f)) f[name] = line.slice(i + 1);
    }
    const when = parseIcsDate(f.DTSTART ?? "");
    if (!when) continue;
    const summary = unescapeIcs(f.SUMMARY ?? "").trim();
    const desc = unescapeIcs(f.DESCRIPTION ?? "").trim();
    const body = desc.replace(/^\.$/, "").trim();
    const title = cleanTitle(summary);
    const format = detectFormat(summary, desc);
    const day = f.DTSTART.slice(0, 8);
    const key = createHash("sha1").update(`${projectKey}|${day}|${strip(title)}|${format}`).digest("hex").slice(0, 32);
    const prev = byKey.get(key);
    if (prev) { prev.copies += 1; continue; }
    byKey.set(key, {
      key,
      title: title.slice(0, 200),
      brand: detectBrand(summary, desc),
      format,
      scheduledAt: when.date,
      hasTime: when.hasTime,
      // Com horário marcado no mLabs = já estava agendado; sem horário = ainda é roteiro.
      status: when.hasTime ? "agendado" : "roteiro",
      script: when.hasTime ? null : body.slice(0, 30000) || null,
      caption: when.hasTime ? body.slice(0, 5000) || null : null,
      copies: 1,
    });
  }
  return [...byKey.values()].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
