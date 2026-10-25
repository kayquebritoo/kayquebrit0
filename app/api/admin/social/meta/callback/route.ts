import { socialCallback } from "@/lib/kbos/social/routes";

export const dynamic = "force-dynamic";

// GET — URI de volta antiga da Meta (se ainda estiver cadastrada no app): mesmo tratamento da nova.
export async function GET(req: Request) {
  return socialCallback(req, "meta");
}
