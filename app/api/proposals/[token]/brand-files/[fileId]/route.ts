import { sql } from "drizzle-orm";
import { db } from "@/lib/kbos/db";
import { readSale } from "@/lib/kbos/sales";
import { budgetFile,downloadResponse } from "@/lib/kbos/planning";
import { checkId } from "@/lib/kbos/validators";
import { PublicError,serverError } from "@/lib/kbos/http";
export async function GET(req:Request,{params}:{params:Promise<{token:string;fileId:string}>}) {
 const {token,fileId}=await params;const bad=checkId(fileId);if(bad)return bad;
 try {
  const sale=await readSale(token);
  const owned=await db().execute(sql`SELECT 1 FROM kbos_budget_uploads WHERE id=${fileId}::uuid AND budget_id=${sale.budgetId}::uuid AND source='client'`);
  if(!owned.rows.length)throw new PublicError("Arquivo não encontrado.",404);
  if(sale.acceptedAt&&!sale.companyProfile?.assets.some(a=>a.fileId===fileId))throw new PublicError("Arquivo não encontrado.",404);
  return downloadResponse(await budgetFile(sale.budgetId,fileId),new URL(req.url).searchParams.has("preview"));
 }catch(e){return serverError(e);}
}
