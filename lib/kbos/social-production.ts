// "Colar status da produção": o Kayque mantém uma lista (dia - marca - formato - situação) e o KBOS aplica no calendário.
import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { db } from "./db";
import { socialPosts } from "./schema";
import type { PostFormat, PostStatus } from "./social-import";

export type ProdLine = { day: number; brand: string | null; format: PostFormat | null; hint: string; status: PostStatus; raw: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function statusFromText(text: string, emoji: string): PostStatus {
  const t = norm(text);
  if (/postad/.test(t)) return "postado";
  if (/agendad/.test(t)) return "agendado";
  if (/ajust/.test(t)) return "ajustes";
  if (/aprova|retorno/.test(t)) return "aprovacao";
  if (/material|captac|gravar|falta/.test(t)) return "captacao";
  if (/edit|fila|producao/.test(t)) return "producao";
  if (emoji.includes("✅") && !emoji.includes("🟡")) return "postado";
  return "producao";
}

function brandOf(word: string): string | null {
  const w = norm(word);
  if (w.startsWith("hotel")) return "Hotel";
  if (w.startsWith("lounge")) return "Lounge";
  if (w.startsWith("praca")) return "Praça";
  return null; // "COLA"/"COLAB" e afins: casa pelo título
}

export function formatOfText(text: string): PostFormat | null {
  const t = norm(text);
  if (/\breels?\b/.test(t)) return "reels";
  if (/carross/.test(t)) return "carrossel";
  if (/\bstor(y|ies)\b/.test(t)) return "story";
  if (/flyer|estatic/.test(t)) return "estatico";
  return null;
}

export function parseProduction(text: string): { lines: ProdLine[]; postedBefore: boolean } {
  const lines: ProdLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^[\s*•\-–]*(\d{1,2})\s*[-–—.]\s*([A-Za-zÀ-ÿ]+)\s*[-–—]?\s*(.*)$/u);
    if (!m) continue;
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    const rest = m[3];
    const emoji = (rest.match(/[✅❌🟡]+/gu) ?? []).join("");
    const after = rest.replace(/[✅❌🟡]+/gu, "|").split("|");
    const head = after[0];
    const tail = after.slice(1).join(" ").replace(/[_*]/g, "").trim();
    lines.push({ day, brand: brandOf(m[2]), format: formatOfText(`${m[2]} ${head}`), hint: head.replace(/[_*]/g, "").trim(), status: statusFromText(tail || head, emoji), raw: raw.trim() });
  }
  return { lines, postedBefore: /demais[^\n]*(tras|anterior)[^\n]*postad/.test(norm(text)) };
}

const words = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));

export type ProdResult = { matched: number; postedBefore: number; restored: number; unmatched: string[] };

export async function applyProduction(projectId: string, month: string, text: string, dryRun: boolean): Promise<ProdResult> {
  const { lines, postedBefore } = parseProduction(text);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(`${month}-01T00:00:00-03:00`);
  const to = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  const rows = await db().select().from(socialPosts).where(and(eq(socialPosts.projectId, projectId), isNotNull(socialPosts.scheduledAt), gte(socialPosts.scheduledAt, from), lt(socialPosts.scheduledAt, to)));
  const dayOf = (d: Date) => Number(d.toLocaleDateString("sv-SE", { timeZone: "America/Belem" }).slice(8, 10));
  const used = new Set<string>();
  const updates = new Map<string, PostStatus>();
  const unmatched: string[] = [];

  for (const l of lines) {
    const cands = rows.filter((r) => r.scheduledAt && dayOf(r.scheduledAt) === l.day && !used.has(r.id) && (!l.brand || !r.brand || r.brand === l.brand));
    const hw = words(l.hint);
    const scored = cands.map((r) => ({ r, score: (l.format && r.format === l.format ? 2 : 0) + [...words(r.title)].filter((w) => hw.has(w)).length + (l.brand && r.brand === l.brand ? 1 : 0) + (r.status === "agendado" ? 0.5 : 0) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || (best.score < 1 && cands.length > 1)) { unmatched.push(`${l.day} ${l.hint.slice(0, 40)}`); continue; }
    used.add(best.r.id);
    updates.set(best.r.id, l.status);
  }

  let before = 0;
  if (postedBefore && lines.length) {
    const anchor = lines[0].day;
    for (const r of rows) if (r.scheduledAt && dayOf(r.scheduledAt) < anchor && !updates.has(r.id) && r.status !== "postado") { updates.set(r.id, "postado"); before++; }
  }
  const dismissed = await db().select({ id: socialPosts.id, d: socialPosts.dismissedAt }).from(socialPosts).where(and(eq(socialPosts.projectId, projectId), isNotNull(socialPosts.dismissedAt)));
  const result: ProdResult = { matched: used.size, postedBefore: before, restored: dismissed.length, unmatched };
  if (dryRun) return result;

  for (const [id, status] of updates) await db().update(socialPosts).set({ status, updatedAt: new Date() }).where(eq(socialPosts.id, id));
  if (dismissed.length) await db().update(socialPosts).set({ dismissedAt: null }).where(and(eq(socialPosts.projectId, projectId), isNotNull(socialPosts.dismissedAt)));
  return result;
}
