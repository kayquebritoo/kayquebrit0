// Banco da importação de contatos: lê o que existe, gera o plano e aplica as decisões.
import { eq, ne } from "drizzle-orm";
import { db } from "./db";
import { contacts } from "./schema";
import { planImport, type ExistingContact, type ImportRecord, type PlanItem, type PlanPatch } from "./contact-import";

export async function loadExisting(): Promise<ExistingContact[]> {
  const rows = await db().select().from(contacts).where(ne(contacts.status, "archived")).limit(20000);
  return rows.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, role: c.role, instagram: c.instagram,
    facebook: c.facebook, website: c.website, photoUrl: c.photoUrl, status: c.status,
    extraEmails: c.extraEmails ?? [], formerPhones: c.formerPhones ?? [], externalIds: c.externalIds ?? {},
  }));
}

export type Decision = { skip?: boolean; primaryPhone?: string | null };
export type CommitResult = { created: number; merged: number; skipped: number; conflicts: number; failed: number };

const dbPatch = (p: PlanPatch) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));

/** Aplica o plano. `decisions[id]` pode pular a pessoa ou escolher outro número como atual. */
export async function commitImport(records: ImportRecord[], decisions: Record<string, Decision> = {}): Promise<CommitResult> {
  const plan = planImport(records, await loadExisting());
  const res: CommitResult = { created: 0, merged: 0, skipped: 0, conflicts: 0, failed: 0 };
  for (const item of plan) {
    const dec = decisions[item.id] ?? {};
    if (item.action === "conflict") { res.conflicts++; continue; }
    if (dec.skip) { res.skipped++; continue; }
    const patch = withChosenPhone(item, dec.primaryPhone);
    try {
      if (item.action === "create") {
        await db().insert(contacts).values({ name: patch.name || "Sem nome", status: "lead", ...dbPatch(patch) } as typeof contacts.$inferInsert);
        res.created++;
      } else if (item.targetId && Object.keys(dbPatch(patch)).length) {
        await db().update(contacts).set(dbPatch(patch)).where(eq(contacts.id, item.targetId));
        res.merged++;
      } else res.skipped++;
    } catch { res.failed++; }
  }
  return res;
}

/** Se o usuário escolheu outro número como atual, troca no patch e manda o resto para "antigos". */
export function withChosenPhone(item: PlanItem, chosen?: string | null): PlanPatch {
  if (!chosen || chosen === item.phone.primary) return item.patch;
  const all = [item.phone.primary, ...item.phone.former, ...item.person.phones.map((p) => p.number)].filter(Boolean) as string[];
  if (!all.includes(chosen)) return item.patch;
  const former = [...new Set(all.filter((n) => n !== chosen))];
  return { ...item.patch, phone: chosen, formerPhones: former };
}
