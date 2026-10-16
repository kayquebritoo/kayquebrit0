import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { campaigns, contacts } from "@/lib/kbos/schema";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { buildIdempotencyKey, enqueueJob } from "@/lib/kbos/jobs";
import { checkId, campaignDispatchSchema, readBody } from "@/lib/kbos/validators";
import { estimateDurationMs, formatDuration, mailable, sendDelayMs, targetStatuses } from "@/lib/kbos/campaigns";
import { serverError } from "@/lib/kbos/http";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

// POST /api/campaigns/[id]/dispatch — enfileira UM job `campaign.dispatch`
// (o fan-out e o pacing acontecem no worker; a API responde na hora).
// Body opcional: `{ scheduledAt }` p/ agendar; sem ele, vale `scheduled_at`
// da campanha ou disparo imediato.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const { id } = await params;
  const bad = checkId(id);
  if (bad) return bad;
  try {
    const parsed = await readBody(req, campaignDispatchSchema);
    if ("error" in parsed) return parsed.error;
    const camp = (await db().select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0];
    if (!camp) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    if (camp.status !== "draft" && camp.status !== "scheduled") {
      return NextResponse.json(
        { error: `Campanha ${camp.status} — só rascunhos/agendadas disparam.` },
        { status: 409 }
      );
    }
    const atRaw = parsed.data.scheduledAt ?? camp.scheduledAt?.toISOString() ?? null;
    const at = atRaw ? new Date(atRaw) : null;
    const delayMs = at && !Number.isNaN(at.getTime()) ? Math.max(0, at.getTime() - Date.now()) : 0;

    // Prévia do público (mesmo filtro do worker) p/ a UI estimar duração.
    const all = await db().select().from(contacts).limit(5000);
    const wanted = targetStatuses(camp.targetStatus || "all");
    const targets = all.filter((c) => wanted.includes(c.status as "lead") && mailable(c.phone)).length;
    if (targets === 0) {
      return NextResponse.json({ error: "Nenhum destinatário discável neste público." }, { status: 400 });
    }

    const r = await enqueueJob(
      "campaign.dispatch",
      { campaignId: camp.id },
      { key: buildIdempotencyKey("campaign.dispatch", { campaign: camp.id }), delayMs: delayMs || undefined }
    );
    if (!r.queued) {
      return NextResponse.json({ error: r.erro || "Fila indisponível." }, { status: 503 });
    }
    const scheduledFor = delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : null;
    await db()
      .update(campaigns)
      .set({
        status: "scheduled",
        scheduledAt: scheduledFor ? new Date(scheduledFor) : camp.scheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, camp.id));
    const base = sendDelayMs();
    return NextResponse.json({
      ok: true,
      deduped: r.deduped ?? false,
      via: r.via,
      targets,
      scheduledFor,
      estimate: formatDuration(estimateDurationMs(targets, base)),
    });
  } catch (e) {
    return serverError(e);
  }
}
