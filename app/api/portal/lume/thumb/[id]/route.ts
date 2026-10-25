import { deny, sessionUser } from "@/lib/kbos/rbac";
import { fetchThumb, lumeReady, projectLumePasta } from "@/lib/kbos/lume-takes";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// GET /api/portal/lume/thumb/:id?projectId= — miniatura do take (o Lume confere se é da pasta do cliente).
export async function GET(req: Request, ctx: Ctx) {
  const user = await sessionUser();
  const denied = deny(user, "cliente", "admin");
  if (denied || !user) return denied!;
  const { id } = await ctx.params;
  const projectId = new URL(req.url).searchParams.get("projectId") || "";
  if (!/^\d{1,12}$/.test(id) || !/^[0-9a-f-]{36}$/i.test(projectId)) return new Response(null, { status: 400 });
  const pasta = await projectLumePasta(projectId, user).catch(() => null);
  if (!pasta || !lumeReady()) return new Response(null, { status: 404 });
  const res = await fetchThumb(pasta, Number(id)).catch(() => null);
  if (!res?.ok || !res.body) return new Response(null, { status: 404 });
  return new Response(res.body, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
