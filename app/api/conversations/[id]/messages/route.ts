import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { conversations, messages } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId, inboxSendSchema, readBody } from "@/lib/kbos/validators";
import { sendAgentMessage } from "@/lib/kbos/inbox";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;
const PAGE_MAX = 300;

// GET /api/conversations/[id]/messages?limit=100&before=ISO — histórico (mais antigas primeiro).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), PAGE_MAX);
    const before = url.searchParams.get("before");
    const beforeDate = before ? new Date(before) : null;
    const filters = [eq(messages.conversationId, id)];
    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      filters.push(lt(messages.createdAt, beforeDate));
    }
    // Busca as N mais recentes e devolve em ordem cronológica p/ o chat.
    const rows = await db()
      .select()
      .from(messages)
      .where(and(...filters))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return NextResponse.json({ items: rows.reverse() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST /api/conversations/[id]/messages — envia via Evolution e persiste.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, inboxSendSchema);
    if ("error" in parsed) return parsed.error;
    const conv = (await db().select().from(conversations).where(eq(conversations.id, id)).limit(1))[0];
    if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    try {
      const r = await sendAgentMessage(conv, {
        content: parsed.data.content,
        mediaUrl: parsed.data.mediaUrl,
        messageType: parsed.data.messageType,
      });
      return NextResponse.json({ ok: true, messageId: r.id }, { status: 201 });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EVOLUTION_MISCONFIGURED") {
        return NextResponse.json(
          { error: "Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE)." },
          { status: 503 }
        );
      }
      if (code === "CHANNEL_UNSUPPORTED") {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Canal sem envio." }, { status: 501 });
      }
      if (code === "CHAT_NOT_DIALABLE") {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Chat inválido." }, { status: 400 });
      }
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha no envio." }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
