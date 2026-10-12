import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { campaignLogs, contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET /api/campaigns/[id]/logs?status=sent — entrega por contato.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const filters = [eq(campaignLogs.campaignId, id)];
    if (status && ["pending", "sent", "failed"].includes(status)) {
      filters.push(eq(campaignLogs.status, status as "pending" | "sent" | "failed"));
    }
    const rows = await db()
      .select({
        id: campaignLogs.id,
        status: campaignLogs.status,
        errorMessage: campaignLogs.errorMessage,
        sentAt: campaignLogs.sentAt,
        contactId: campaignLogs.contactId,
        contactName: contacts.name,
        contactPhone: contacts.phone,
        contactCompany: contacts.company,
      })
      .from(campaignLogs)
      .leftJoin(contacts, eq(campaignLogs.contactId, contacts.id))
      .where(and(...filters))
      .orderBy(desc(campaignLogs.sentAt))
      .limit(1000);
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
