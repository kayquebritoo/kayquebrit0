import { planningFile, downloadResponse } from "@/lib/kbos/planning";
import { serverError } from "@/lib/kbos/http";
import { checkId } from "@/lib/kbos/validators";
export async function GET(req:Request,{params}:{params:Promise<{token:string;fileId:string}>}) {
 const {token,fileId}=await params; const bad=checkId(fileId);if(bad)return bad;
 try{return downloadResponse(await planningFile(token,fileId),new URL(req.url).searchParams.has("preview"));}catch(e){return serverError(e);}
}
