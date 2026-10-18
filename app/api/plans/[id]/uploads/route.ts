import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { serverError } from "@/lib/kbos/http";
import { adminClientPlan, budgetFile, downloadResponse } from "@/lib/kbos/planning";
import { readUploadForm,uploadSaleFile } from "@/lib/kbos/sale-uploads";
import { checkId } from "@/lib/kbos/validators";
import { PublicError } from "@/lib/kbos/http";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const denied=deny(await sessionUser(),"admin");if(denied)return denied;
 const {id}=await params;const bad=checkId(id);if(bad)return bad;
 try{const {sale}=await adminClientPlan(id);const form=await readUploadForm(req);const file=form.get("file");
 if(!file||typeof file==="string")throw new PublicError("Selecione um arquivo.");
 return NextResponse.json({item:await uploadSaleFile(sale.budgetId,file.name,Buffer.from(await file.arrayBuffer()),{allowAccepted:true})});
 }catch(e){return serverError(e);}
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
 const denied=deny(await sessionUser(),"admin");if(denied)return denied;
 const {id}=await params;const bad=checkId(id);if(bad)return bad;
 const fileId=new URL(req.url).searchParams.get("file")||"";const badFile=checkId(fileId);if(badFile)return badFile;
 try{const {sale}=await adminClientPlan(id);return downloadResponse(await budgetFile(sale.budgetId,fileId),new URL(req.url).searchParams.has("preview"));}catch(e){return serverError(e);}
}
