import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/kbos/auth";
import { SESSION_COOKIE } from "@/lib/kbos/rbac";

export async function POST() {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await destroySession(sid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
