import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { PublicError } from "./http";
import { readSale } from "./sales";

import { MAX_UPLOAD_BYTES } from "./sale-file-types";
const MIMES: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  odt: "application/vnd.oasis.opendocument.text", odp: "application/vnd.oasis.opendocument.presentation", ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
};

export function validateUpload(name: string, bytes: Buffer) {
  const clean = name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200);
  const ext = clean.split(".").pop()?.toLowerCase() || "";
  const mime = MIMES[ext];
  if (!mime) throw new PublicError("Formato não aceito. Use PDF, documentos, apresentações, planilhas ou imagens.");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new PublicError("Cada arquivo deve ter conteúdo e no máximo 10 MB.", 413);
  const hex = bytes.subarray(0, 8).toString("hex");
  const prefix = bytes.subarray(0, 12).toString("ascii");
  const valid = ext === "pdf" ? prefix.startsWith("%PDF-")
    : ["doc", "ppt", "xls"].includes(ext) ? hex === "d0cf11e0a1b11ae1"
    : ["docx", "pptx", "xlsx", "odt", "odp", "ods"].includes(ext) ? prefix.startsWith("PK\x03\x04")
    : ["jpg", "jpeg"].includes(ext) ? hex.startsWith("ffd8ff")
    : ext === "png" ? hex === "89504e470d0a1a0a"
    : ext === "gif" ? /^GIF8[79]a/.test(prefix)
    : ext === "webp" ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP"
    : ext === "rtf" ? prefix.startsWith("{\\rtf")
    : !bytes.includes(0);
  if (!valid) throw new PublicError("O conteúdo do arquivo não corresponde ao formato informado.");
  return { name: clean, mime, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function uploadSaleFile(budgetId: string, name: string, bytes: Buffer) {
  const meta = validateUpload(name, bytes);
  // Bloqueia o orçamento para serializar uploads e limitar a 50 MB por proposta.
  const result = await db().execute(sql`
    WITH b AS (UPDATE kbos_budgets SET upload_bytes = upload_bytes + ${meta.size}
      WHERE id = ${budgetId}::uuid AND status IN ('draft','sent') AND upload_bytes + ${meta.size} <= 52428800
        AND NOT EXISTS (SELECT 1 FROM kbos_budget_sales s WHERE s.budget_id = ${budgetId}::uuid AND s.accepted_at IS NOT NULL)
      RETURNING id)
    INSERT INTO kbos_budget_uploads (budget_id, name, mime, size, sha256, content)
    SELECT b.id, ${meta.name}, ${meta.mime}, ${meta.size}, ${meta.sha256}, decode(${bytes.toString("base64")}, 'base64')
    FROM b
    RETURNING id`);
  if (!result.rows.length) throw new PublicError("O orçamento não está disponível para anexos ou atingiu o limite de 50 MB.", 409);
  return { ...meta, id: String(result.rows[0].id) };
}

export async function readSaleFile(token: string, fileId: string) {
  const sale = await readSale(token);
  if (!sale.plan.attachments?.some((a) => a.kind === "file" && a.fileId === fileId)) throw new PublicError("Arquivo não encontrado.", 404);
  const result = await db().execute(sql`SELECT name, mime, encode(content, 'base64') AS data FROM kbos_budget_uploads WHERE id = ${fileId}::uuid AND budget_id = ${sale.budgetId}::uuid`);
  const row = result.rows[0];
  if (!row) throw new PublicError("Arquivo não encontrado.", 404);
  return { name: String(row.name), mime: String(row.mime), bytes: Buffer.from(String(row.data), "base64") };
}

/** Limita também corpos sem Content-Length, antes de interpretar o multipart. */
export async function readUploadForm(req: Request): Promise<FormData> {
  const max = MAX_UPLOAD_BYTES + 64 * 1024;
  if (Number(req.headers.get("content-length")) > max) throw new PublicError("Cada arquivo pode ter no máximo 10 MB.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new PublicError("Envie um arquivo.");
  let size = 0;
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new PublicError("Cada arquivo pode ter no máximo 10 MB.", 413); }
    chunks.push(Buffer.from(value));
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData(); }
  catch { throw new PublicError("Envio inválido. Selecione o arquivo novamente."); }
}
