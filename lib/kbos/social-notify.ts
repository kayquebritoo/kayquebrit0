// Avisos por WhatsApp do fluxo de aprovação (nunca quebram a operação principal).
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { users } from "./schema";
import { notifyProject, queueWhatsApp } from "./whatsapp";
import type { Post } from "./social-posts";

const FORMAT_LABEL: Record<string, string> = { reels: "Reels", carrossel: "Carrossel", estatico: "Flyer", story: "Story", outro: "Post" };

/** Cliente: "tem post esperando sua aprovação" (com link do portal). */
export async function notifyApprovalNeeded(post: Post) {
  if (!post.projectId) return;
  const when = post.scheduledAt ? ` para ${post.scheduledAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Belem" })}` : "";
  await notifyProject(post.projectId, `post:${post.id}:aprovacao`, `Tem um ${FORMAT_LABEL[post.format] ?? "post"} esperando sua aprovação${when}: *${post.title}*.\nAprove ou peça ajustes pelo portal: https://kbos.kayquebrito.com.br/portal`);
}

/** Equipe (admins com telefone): o cliente aprovou ou pediu ajustes. */
export async function notifyDecision(post: Post, decision: "aprovar" | "ajustes") {
  try {
    const admins = await db().select({ phone: users.phone }).from(users).where(and(eq(users.role, "admin"), isNotNull(users.phone)));
    const text = decision === "aprovar"
      ? `*KBOS — Conteúdo*\n✅ Aprovado pelo cliente: *${post.title}*.`
      : `*KBOS — Conteúdo*\n✏️ Pediram ajustes em *${post.title}*: ${post.clientNote ?? ""}`;
    for (const a of admins) if (a.phone) await queueWhatsApp(a.phone, text, `post:${post.id}:${decision}`);
  } catch (e) {
    console.error("[KBOS social-notify]", e);
  }
}

/** Equipe: o cliente cadastrou um roteiro pelo portal (no máximo 1 aviso por projeto por dia). */
export async function notifyClientRoteiro(post: Post) {
  try {
    const admins = await db().select({ phone: users.phone }).from(users).where(and(eq(users.role, "admin"), isNotNull(users.phone)));
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Belem" });
    for (const a of admins) if (a.phone) await queueWhatsApp(a.phone, `*KBOS — Conteúdo*\n📝 O cliente cadastrou um roteiro: *${post.title}*. Veja em Produção → Conteúdo e posts.`, `roteiro:${post.projectId}:${day}`);
  } catch (e) {
    console.error("[KBOS social-notify]", e);
  }
}
