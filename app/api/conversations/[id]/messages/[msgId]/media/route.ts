import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { conversations, messages } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { checkId } from "@/lib/kbos/validators";
import { fetchInboundMedia } from "@/lib/kbos/inbox";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// GET /api/conversations/[id]/messages/[msgId]/media — mídia do WhatsApp.
// A URL que vem no webhook é criptografada (mmg.whatsapp.net/…enc); a
// Evolution descriptografa e devolve em base64. Cache no navegador por 7 dias.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; msgId: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id, msgId } = await params;
  const bad = checkId(id) || checkId(msgId);
  if (bad) return bad;
  try {
    const row = (
      await db()
        .select({ m: messages, chatId: conversations.channelChatId, channel: conversations.channel })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(eq(messages.id, msgId), eq(messages.conversationId, id)))
        .limit(1)
    )[0];
    if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const { m } = row;
    if (row.channel === "whatsapp" && m.externalId) {
      const media = await fetchInboundMedia({
        externalId: m.externalId,
        chatId: row.chatId,
        fromMe: m.senderType !== "customer",
        messageType: m.messageType,
      });
      if (media) {
        return new Response(new Uint8Array(media.bytes), {
          headers: {
            "Content-Type": media.mime,
            "Cache-Control": "private, max-age=604800, immutable",
            "Content-Length": String(media.bytes.length),
          },
        });
      }
    }
    if (m.mediaUrl && /^https:\/\//.test(m.mediaUrl) && !m.mediaUrl.includes(".whatsapp.net")) {
      return NextResponse.redirect(m.mediaUrl);
    }
    return NextResponse.json({ error: "Mídia indisponível (expirou no WhatsApp)." }, { status: 404 });
  } catch (e) {
    return serverError(e);
  }
}
