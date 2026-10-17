import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import {
  briefings,
  budgets,
  contacts,
  conversations,
  events,
  messages,
  projects,
  transactions,
} from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { briefingTimeZone } from "@/lib/kbos/morning-briefing";
import { buildDemands, dayKey, greeting, monthCash, type TrxRow } from "@/lib/kbos/today";

export const dynamic = "force-dynamic";

type FeedItem = { id: string; at: string; kind: "mensagem" | "orcamento" | "financeiro" | "briefing"; text: string; href: string };

// GET /api/admin/today — tudo que a tela "Hoje" mostra, já agregado no
// servidor: alertas de prazo (tarefas + dinheiro), caixa do mês, agenda do
// dia e o feed "ao vivo". Admin-only.
export async function GET() {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const tz = briefingTimeZone();
    const now = new Date();
    const todayKey = dayKey(now, tz);
    const since = new Date(now.getTime() - 120 * 86_400_000);
    const d = db();

    const [trx, prj, bud, evs, unread, msgs, recentBud, recentTrx, recentBrief] = await Promise.all([
      d
        .select({
          id: transactions.id,
          tipo: transactions.tipo,
          descricao: transactions.descricao,
          categoria: transactions.categoria,
          valor: transactions.valor,
          vencimento: transactions.vencimento,
          status: transactions.status,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(gte(sql`coalesce(${transactions.vencimento}, ${transactions.createdAt})`, since))
        .limit(2000),
      d
        .select({ id: projects.id, titulo: projects.titulo, status: projects.status, prazo: projects.prazo })
        .from(projects)
        .where(isNotNull(projects.prazo))
        .limit(500),
      d
        .select({
          id: budgets.id,
          code: budgets.code,
          title: budgets.title,
          status: budgets.status,
          validUntil: budgets.validUntil,
          totalAmount: budgets.totalAmount,
          clientName: budgets.clientName,
          clientCompany: budgets.clientCompany,
        })
        .from(budgets)
        .where(inArray(budgets.status, ["draft", "sent"]))
        .limit(300),
      d
        .select({ id: events.id, title: events.title, startTime: events.startTime, location: events.location })
        .from(events)
        .where(
          and(
            gte(events.startTime, new Date(now.getTime() - 24 * 3_600_000)),
            lte(events.startTime, new Date(now.getTime() + 36 * 3_600_000))
          )
        )
        .orderBy(events.startTime)
        .limit(50),
      d
        .select({ n: sql<number>`coalesce(sum(${conversations.unreadCount}), 0)::int` })
        .from(conversations)
        .where(eq(conversations.status, "open")),
      d
        .select({
          id: messages.id,
          at: messages.createdAt,
          content: messages.content,
          type: messages.messageType,
          name: contacts.name,
          conversationId: messages.conversationId,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(eq(messages.senderType, "customer"))
        .orderBy(desc(messages.createdAt))
        .limit(6),
      d
        .select({ id: budgets.id, at: budgets.updatedAt, code: budgets.code, title: budgets.title, client: budgets.clientCompany })
        .from(budgets)
        .orderBy(desc(budgets.updatedAt))
        .limit(4),
      d
        .select({
          id: transactions.id,
          at: transactions.createdAt,
          tipo: transactions.tipo,
          descricao: transactions.descricao,
          valor: transactions.valor,
        })
        .from(transactions)
        .orderBy(desc(transactions.createdAt))
        .limit(4),
      d
        .select({ id: briefings.id, at: briefings.createdAt, categoria: briefings.categoria, nome: briefings.clienteNome })
        .from(briefings)
        .orderBy(desc(briefings.createdAt))
        .limit(3),
    ]);

    const demands = buildDemands({ transactions: trx as TrxRow[], projects: prj, budgets: bud }, todayKey, tz);
    const cash = monthCash(trx as TrxRow[], todayKey, tz);

    const agenda = evs
      .filter((e) => dayKey(e.startTime, tz) === todayKey)
      .map((e) => ({ id: e.id, title: e.title, at: e.startTime.toISOString(), location: e.location }));

    const brl = (v: string | number) =>
      Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const feed: FeedItem[] = [
      ...msgs.map((m) => ({
        id: `msg-${m.id}`,
        at: m.at.toISOString(),
        kind: "mensagem" as const,
        text:
          m.type === "audio"
            ? `${m.name || "Contato"} mandou um áudio`
            : `${m.name || "Contato"}: ${(m.content || "").slice(0, 90)}`,
        href: `/admin/inbox?c=${m.conversationId}`,
      })),
      ...recentBud.map((b) => ({
        id: `bud-${b.id}`,
        at: b.at.toISOString(),
        kind: "orcamento" as const,
        text: `Orçamento ${b.code} atualizado · ${b.client || b.title}`,
        href: "/admin/orcamentos",
      })),
      ...recentTrx.map((t) => ({
        id: `trx-${t.id}`,
        at: t.at.toISOString(),
        kind: "financeiro" as const,
        text: `${t.tipo === "entrada" ? "Entrada" : "Despesa"} registrada: ${t.descricao}, ${brl(t.valor)}`,
        href: "/admin/financeiro",
      })),
      ...recentBrief.map((b) => ({
        id: `brf-${b.id}`,
        at: b.at.toISOString(),
        kind: "briefing" as const,
        text: `Novo briefing pelo site · ${b.nome} (${b.categoria})`,
        href: "/admin/briefings",
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);

    const counts = {
      late: demands.filter((x) => x.urgency === "late").length,
      soon: demands.filter((x) => x.urgency === "soon").length,
      proposals: bud.length,
      unread: unread[0]?.n ?? 0,
    };

    return NextResponse.json(
      {
        now: now.toISOString(),
        todayKey,
        greeting: greeting(now, tz),
        name: (user?.name || "").split(" ")[0] || null,
        counts,
        demands,
        cash,
        agenda,
        feed,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return serverError(e);
  }
}
