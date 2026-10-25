import { socialCallback } from "@/lib/kbos/social/routes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ provider: string }> };

// GET — volta do login da rede: confere state/PKCE, troca o código, guarda tokens criptografados e as contas.
export async function GET(req: Request, { params }: Ctx) {
  return socialCallback(req, (await params).provider);
}
