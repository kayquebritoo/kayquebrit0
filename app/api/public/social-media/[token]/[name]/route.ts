import { openPublicMedia } from "@/lib/kbos/social-media";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string; name: string }> };

// GET — arquivo final do post para a rede social baixar (link com token secreto; sem login). Aceita Range.
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const m = await openPublicMedia(token).catch(() => null);
  if (!m) return new Response("Não encontrado.", { status: 404 });
  const { fh, size, row } = m;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  let start = 0, end = size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { await fh.close(); return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } }); }
  }
  const stream = fh.createReadStream({ start, end });
  const body = new ReadableStream({
    start(c) { stream.on("data", (d) => c.enqueue(d as Buffer)); stream.on("end", () => { c.close(); void fh.close(); }); stream.on("error", (e) => { c.error(e); void fh.close(); }); },
    cancel() { stream.destroy(); void fh.close(); },
  });
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { "content-type": row.mime, "content-length": String(end - start + 1), "accept-ranges": "bytes", ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}), "cache-control": "private, max-age=3600", "x-robots-tag": "noindex" },
  });
}
