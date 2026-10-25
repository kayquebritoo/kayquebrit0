import { socialConnect } from "@/lib/kbos/social/routes";
import { withRateLimit } from "@/lib/kbos/rate-limit";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ provider: string }> };

// GET ?project=<id> | ?link=<token> — leva ao login oficial da rede (admin, cliente no portal ou link de conexão).
export async function GET(req: Request, { params }: Ctx) {
  const limited = await withRateLimit(req, "social:connect");
  if (limited) return limited;
  return socialConnect(req, (await params).provider);
}
