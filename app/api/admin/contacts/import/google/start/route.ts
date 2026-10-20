import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { hostBaseFromRequest, appUrlEnv } from "@/lib/kbos/email";
import { GOOGLE_CONTACTS_SCOPE } from "@/lib/kbos/google-contacts";

export const dynamic = "force-dynamic";

// GET /api/admin/contacts/import/google/start — leva o admin ao consentimento do Google (só leitura de contatos).
export async function GET(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  const id = (process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!id || !(process.env.GOOGLE_CLIENT_SECRET || "").trim()) {
    return NextResponse.redirect(new URL("/admin/crm?importar=erro&motivo=google-config", req.url));
  }
  const base = hostBaseFromRequest(req) ?? appUrlEnv();
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: id, redirect_uri: `${base}/api/admin/contacts/import/google/callback/`, response_type: "code",
    scope: GOOGLE_CONTACTS_SCOPE, access_type: "online", include_granted_scopes: "true", prompt: "consent", state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("kbos_gcontacts_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/contacts/import/google/", maxAge: 600 });
  return res;
}
