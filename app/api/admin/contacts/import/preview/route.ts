import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { ensureRedis, getRedis } from "@/lib/kbos/jobs";
import { checkWhatsappNumbers, listWhatsappContacts } from "@/lib/kbos/evolution";
import { canonPhone, parseContactFile, planImport, type ImportRecord } from "@/lib/kbos/contact-import";
import { loadExisting } from "@/lib/kbos/contact-import-db";
import { MAX_RECORDS, previewBody, recordSchema } from "@/lib/kbos/contact-import-api";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/contacts/import/preview — lê a fonte (arquivo, WhatsApp ou Google), junta a mesma pessoa e mostra o plano.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const parsed = await readBody(req, previewBody);
    if ("error" in parsed) return parsed.error;
    const { source, text, sessionId } = parsed.data;
    let records: ImportRecord[] = [];
    let notice = "";
    if (source === "arquivo") {
      if (!text?.trim()) return NextResponse.json({ error: "Envie um arquivo .vcf ou .csv." }, { status: 400 });
      records = parseContactFile(text, "arquivo");
    } else if (source === "whatsapp") {
      const r = await listWhatsappContacts();
      if (r.detail) notice = r.detail;
      records = r.contacts.map((c) => ({ name: c.name, phones: [{ number: c.number, source: "whatsapp" as const }], emails: [], photoUrl: c.photoUrl, source: "whatsapp" as const, externalId: c.number }));
    } else {
      if (!sessionId || !(await ensureRedis(1500))) return NextResponse.json({ error: "Conecte o Google de novo (a busca expirou)." }, { status: 400 });
      const raw = await getRedis().get(`kbos:import:google:${user.id}:${sessionId}`);
      if (!raw) return NextResponse.json({ error: "A busca no Google expirou. Conecte de novo." }, { status: 410 });
      records = z.array(recordSchema).parse(JSON.parse(raw)) as ImportRecord[];
    }
    if (records.length > MAX_RECORDS) { records = records.slice(0, MAX_RECORDS); notice = `Mostrando os primeiros ${MAX_RECORDS} contatos; importe o resto em outra rodada.`; }
    const existing = await loadExisting();
    let plan = planImport(records, existing);
    // Quando a mesma pessoa tem mais de um número, pergunta ao WhatsApp qual existe de fato (melhor pista do "atual").
    let verified: Record<string, boolean | null> = {};
    const doubtful = plan.filter((p) => p.phone.needsReview).flatMap((p) => [p.phone.primary, ...p.phone.former, ...p.person.phones.map((x) => x.number)]);
    const uniq = [...new Set(doubtful.map((n) => canonPhone(n)).filter(Boolean) as string[])].slice(0, 200);
    if (uniq.length) {
      verified = await checkWhatsappNumbers(uniq);
      if (Object.values(verified).some((v) => v !== null)) plan = planImport(records, existing, verified);
    }
    const summary = { total: plan.length, create: plan.filter((p) => p.action === "create").length, merge: plan.filter((p) => p.action === "merge" && p.changes[0] !== "Sem novidades").length, same: plan.filter((p) => p.action === "merge" && p.changes[0] === "Sem novidades").length, conflict: plan.filter((p) => p.action === "conflict").length, review: plan.filter((p) => p.phone.needsReview).length };
    return NextResponse.json({ records, plan, summary, notice });
  } catch (e) {
    return serverError(e);
  }
}
