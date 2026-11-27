import {signingArchiveDownload} from "../../../../../../lib/signingArchiveDownload.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_req,{params}){
 const {id,kind}=await params;
 return signingArchiveDownload({mode:"customer",id,kind});
}
