import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { transactions } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { financeCreateSchema, readBody } from "@/lib/kbos/validators";
import { cashFlowByMonth, summarize, toDbInsert, toFinanceEntry } from "@/lib/kbos/finance";
import { serverError } from "@/lib/kbos/http";

// Central Financeira — contrato EN sobre `kbos_transactions` (ver finance.ts).
// Admin-only (mesma regra do ERP `/api/transactions`).
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const q = new URL(req.url).searchParams;
    const rows = await db().select().from(transactions).orderBy(desc(transactions.createdAt)).limit(500);
    const items = rows.map(toFinanceEntry);
    const type = q.get("type");
    const status = q.get("status");
    const filtered = items.filter(
      (e) => (!type || e.type === type) && (!status || e.status === status)
    );
    return NextResponse.json({
      items: filtered,
      summary: summarize(items),
      cashFlow: cashFlowByMonth(items),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, financeCreateSchema);
    if ("error" in parsed) return parsed.error;
    const rows = await db().insert(transactions).values(toDbInsert(parsed.data)).returning();
    return NextResponse.json({ ok: true, item: toFinanceEntry(rows[0]) }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
