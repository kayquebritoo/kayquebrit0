import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { contacts, conversations } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { conversationCreateSchema, readBody } from "@/lib/kbos/validators";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const CHANNELS = ["whatsapp", "instagram", "telegram", "messenger", "webchat"] as const;
const STATUS = ["open", "pending", "closed"] as const;

// GET /api/conversations?status=open&channel=whatsapp&q=busca — inbox (equipe).
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const q = (url.searchParams.get("q") || "").trim();
    const filters = [];
    if (status && (STATUS as readonly string[]).includes(status)) {
      filters.push(eq(conversations.status, status as "open" | "pending" | "closed"));
    }
    if (channel && (CHANNELS as readonly string[]).includes(channel)) {
      filters.push(eq(conversations.channel, channel as "whatsapp"));
    }
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(contacts.name, like),
          ilike(contacts.phone, like),
          ilike(contacts.company, like),
          ilike(conversations.channelChatId, like)
        )
      );
    }
    const rows = await db()
      .select({
        id: conversations.id,
        contactId: conversations.contactId,
        channel: conversations.channel,
        channelChatId: conversations.channelChatId,
        status: conversations.status,
        unreadCount: conversations.unreadCount,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        contactName: contacts.name,
        contactPhone: contacts.phone,
        contactCompany: contacts.company,
        contactStatus: contacts.status,
      })
      .from(conversations)
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(200);
    const unreadTotal = rows.reduce((a, r) => a + (r.unreadCount ?? 0), 0);
    return NextResponse.json({ items: rows, unreadTotal });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST /api/conversations — cria conversa manual (equipe).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  try {
    const parsed = await readBody(req, conversationCreateSchema);
    if ("error" in parsed) return parsed.error;
    const b = parsed.data;
    try {
      const rows = await db()
        .insert(conversations)
        .values({
          contactId: b.contactId ?? null,
          channel: b.channel ?? "whatsapp",
          channelChatId: b.channelChatId,
          status: b.status ?? "open",
        })
        .returning();
      return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/unique|duplicate/i.test(msg)) {
        const existing = (
          await db()
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.channel, b.channel ?? "whatsapp"),
                eq(conversations.channelChatId, b.channelChatId)
              )
            )
            .limit(1)
        )[0];
        return NextResponse.json({ ok: true, deduped: true, item: existing ?? null });
      }
      throw e;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
