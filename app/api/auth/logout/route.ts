import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession } from "@/lib/kbos/auth";
import { SESSION_COOKIE_ALIASES } from "@/lib/kbos/rbac";

export async function POST() {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_ALIASES) {
    const sid = jar.get(name)?.value;
    // destroySession ignora bypass/uuid inválido internamente; o cookie é
    // sempre limpo abaixo (inclusive o nome alternativo `kbos.session-token`).
    if (sid) await destroySession(sid);
  }
  const res = NextResponse.json({ ok: true });
  for (const name of SESSION_COOKIE_ALIASES) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
