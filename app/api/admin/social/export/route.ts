import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { calendarCsv, calendarSnapshot } from "@/lib/kbos/calendar-export";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const id = q.get("projectId") ?? "";
  const format = q.get("format") ?? "json";
  const month = q.get("month") ?? undefined;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["json", "csv"].includes(format) || (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) return NextResponse.json({ error: "Exportação inválida." }, { status: 400 });
  try {
    const snapshot = await calendarSnapshot(id);
    const body = format === "csv" ? calendarCsv(snapshot.posts, month) : JSON.stringify(snapshot, null, 2);
    return new Response(body, { headers: { "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", "Content-Disposition": `${q.get("preview") === "1" ? "inline" : "attachment"}; filename="calendario-${id}-${format === "json" ? "completo" : month ?? "completo"}.${format}"`, "Cache-Control": "private, no-store" } });
  } catch (e) { return serverError(e); }
}
