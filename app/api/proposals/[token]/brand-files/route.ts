import { NextResponse } from "next/server";
import { readSale } from "@/lib/kbos/sales";
import { readUploadForm, uploadSaleFile } from "@/lib/kbos/sale-uploads";
import { PublicError, serverError } from "@/lib/kbos/http";
import { withRateLimit } from "@/lib/kbos/rate-limit";
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}) {
 const limited=await withRateLimit(req,"proposals:upload");if(limited)return limited;
 try {
  const sale=await readSale((await params).token);
  if(sale.acceptedAt)throw new PublicError("A marca assinada está preservada. Peça uma revisão pelo planejamento.",409);
  const form=await readUploadForm(req); const file=form.get("file");
  if(!file||typeof file==="string")throw new PublicError("Selecione um arquivo.");
  return NextResponse.json({item:await uploadSaleFile(sale.budgetId,file.name,Buffer.from(await file.arrayBuffer()),{source:"client"})},{status:201});
 }catch(e){return serverError(e);}
}
