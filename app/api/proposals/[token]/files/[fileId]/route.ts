import { NextResponse } from "next/server";
import { checkId } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { readSaleFile } from "@/lib/kbos/sale-uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const bad = checkId(fileId);
  if (bad) return bad;
  try {
    const file = await readSaleFile(token, fileId);
    return new NextResponse(new Uint8Array(file.bytes), { headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="arquivo.${file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "")}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer",
    } });
  } catch (e) { return serverError(e); }
}
