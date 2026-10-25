import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { appUrlEnv } from "@/lib/kbos/email";
import { metaConfigured, metaLoginUrl, metaRedirectUri, metaStateSig } from "@/lib/kbos/meta";

export const dynamic = "force-dynamic";

// GET — admin vai para o login da Meta e escolhe as Páginas/Instagram que o KBOS pode publicar.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  if (!metaConfigured()) return NextResponse.redirect(new URL("/admin/ajustes/?redes=config", appUrlEnv()));
  const nonce = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(metaLoginUrl(metaRedirectUri(), `${nonce}.${metaStateSig(nonce)}`));
  res.cookies.set("kbos_meta_state", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
