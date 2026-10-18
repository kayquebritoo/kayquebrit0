import { timingSafeEqual } from "node:crypto";
import { deny, sessionUser } from "./rbac";

/** Admin logado OU ferramenta de envio com o token de ingestão (GALLERY_INGEST_TOKEN). */
export async function galleryAdmin(req: Request) {
  const want = process.env.GALLERY_INGEST_TOKEN || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length >= 24 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  return deny(await sessionUser(), "admin");
}
