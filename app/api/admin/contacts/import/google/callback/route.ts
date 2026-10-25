import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { appUrlEnv } from "@/lib/kbos/email";
import { ensureRedis, getRedis } from "@/lib/kbos/jobs";
import { fetchGoogleContacts } from "@/lib/kbos/google-contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET .../google/callback — troca o código, busca os contatos, guarda 30 min no Redis (por admin) e volta ao CRM.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const url = new URL(req.url);
  // redirect_uri e voltas sempre pela URL pública (atrás do Caddy o host do request pode ser o interno).
  const base = appUrlEnv();
  const fail = (motivo: string) => NextResponse.redirect(new URL(`/admin/crm?importar=erro&motivo=${motivo}`, base));
  const cookie = req.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("kbos_gcontacts_state="))?.split("=")[1];
  if (url.searchParams.get("error")) return fail("negado");
  if (!cookie || cookie !== url.searchParams.get("state") || !url.searchParams.get("code")) return fail("estado");
  try {
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${base}/api/admin/contacts/import/google/callback/`, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tok.ok) {
      const e = (await tok.json().catch(() => ({}))) as { error?: string; error_description?: string };
      console.error("[contacts-import] token do Google recusado:", tok.status, e.error, e.error_description, "redirect_uri=", `${base}/api/admin/contacts/import/google/callback/`);
      return fail("token");
    }
    const { access_token } = (await tok.json()) as { access_token?: string };
    if (!access_token) return fail("token");
    const records = await fetchGoogleContacts(access_token);
    if (!(await ensureRedis(1500))) return fail("redis");
    const sid = randomUUID();
    await getRedis().set(`kbos:import:google:${user.id}:${sid}`, JSON.stringify(records), "EX", 1800);
    const res = NextResponse.redirect(new URL(`/admin/crm?importar=google&sessao=${sid}`, base));
    res.cookies.delete("kbos_gcontacts_state");
    return res;
  } catch (e) {
    console.error("[contacts-import] falha ao buscar contatos:", e instanceof Error ? e.message : e);
    return fail("google");
  }
}
