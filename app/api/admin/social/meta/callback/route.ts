import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { exchangeCode, listMetaAccounts, MetaError, metaRedirectUri, metaStateSig } from "@/lib/kbos/meta";
import { saveMetaAccounts } from "@/lib/kbos/social-publish";

export const dynamic = "force-dynamic";
const back = (req: Request, q: string) => NextResponse.redirect(new URL(`/admin/ajustes/?${q}`, req.url));

// GET — volta do login da Meta: troca o código, lista Páginas + Instagram e guarda os tokens criptografados.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  if (sp.get("error")) return back(req, "redes=cancelado");
  const [nonce, sig] = (sp.get("state") || "").split(".");
  const jar = await cookies();
  const expected = nonce ? metaStateSig(nonce) : "";
  const ok = !!nonce && jar.get("kbos_meta_state")?.value === nonce && sig?.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok || !sp.get("code")) return back(req, "redes=estado");
  try {
    const { token } = await exchangeCode(sp.get("code")!, metaRedirectUri());
    const accounts = await listMetaAccounts(token);
    const n = await saveMetaAccounts(accounts, user!.id);
    const res = back(req, `redes=ok&contas=${n}`);
    res.cookies.delete("kbos_meta_state");
    return res;
  } catch (e) {
    console.error("[meta] callback", e instanceof Error ? e.message : e);
    return back(req, `redes=erro&msg=${encodeURIComponent(e instanceof MetaError ? e.message.slice(0, 160) : "Falha ao falar com a Meta.")}`);
  }
}
