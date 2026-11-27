import "server-only";
import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";

const messages={
 S36_INVALID_IMPORT:"Ugyldig leverandør eller import.",
 S36_INCOMPLETE_UPLOAD:"Ikke alle delene av prisfilen ble mottatt. Start en ny forhåndsvisning.",
 S36_INVALID_SIZE:"Prislisten er for stor eller tom.",
 S36_INVALID_OR_DUPLICATE_PRODUCTS:"Prislisten har ugyldige varer eller duplikate varenumre.",
 S36_PREVIEW_NOT_FOUND:"Forhåndsvisningen finnes ikke for denne eieren.",
 S36_PREVIEW_EXPIRED:"Forhåndsvisningen er utløpt. Last opp filen på nytt.",
 S36_APPROVAL_REQUIRED:"Du må bekrefte importen med riktig godkjenningsfrase.",
 S36_CATALOG_CHANGED:"Prislisten er endret siden forhåndsvisningen. Kontroller filen på nytt."
};
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(error){
 const code=Object.keys(messages).find(key=>String(error?.message||"").includes(key));
 return reply({error:code?messages[code]:"Importen kunne ikke bekreftes. Ingen delvis import aktiveres. Kontroller status eller prøv samme godkjenning igjen."},code?409:503);
}
export async function previewMaterialImport(s,user,{supplierId,supplierName,filename,products,skipped}){
 if(user?.role!=="owner")return reply({error:"Kun eier kan importere leverandørpriser."},403);
 if(process.env.VERCEL_ENV!=="production")return reply({error:"Prisimport er sperret i testmiljø."},403);
 const owner=String(user.id);
 if(products.length>100000)return reply({error:"Maks 100 000 varer per import."},413);
 let data,error;
 if(products.length<=10000){
  ({data,error}=await s.rpc("preview_material_import",{p_supplier:supplierId,p_name:supplierName,p_filename:filename,p_owner:owner,p_products:products,p_skipped:skipped}));
 }else{
  const upload=randomUUID(),size=5000,total=Math.ceil(products.length/size);
  try{
   const cleanup=await s.from("material_import_chunks").delete().lt("created_at",new Date(Date.now()-24*60*60*1000).toISOString());
   if(cleanup.error)return failure(cleanup.error);
   for(let i=0;i<total;i++){
    const result=await s.from("material_import_chunks").insert({upload_id:upload,owner_id:owner,chunk_number:i,products:products.slice(i*size,(i+1)*size)});
    if(result.error)throw result.error;
   }
   ({data,error}=await s.rpc("finish_large_material_import",{p_upload:upload,p_owner:owner,p_supplier:supplierId,p_name:supplierName,p_filename:filename,p_chunks:total,p_count:products.length,p_skipped:skipped}));
  }catch(e){error=e;}
  finally{try{await s.from("material_import_chunks").delete().eq("upload_id",upload).eq("owner_id",owner);}catch{}}
 }
 if(error||!data?.previewId)return failure(error);
 return reply({ok:true,preview:data});
}
export async function activateMaterialImport(s,user,{previewId,phrase}){
 if(user?.role!=="owner")return reply({error:"Kun eier kan aktivere leverandørpriser."},403);
 if(process.env.VERCEL_ENV!=="production")return reply({error:"Prisimport er sperret i testmiljø."},403);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(previewId||"")))return reply({error:"Ugyldig forhåndsvisning."},400);
 const {data,error}=await s.rpc("activate_material_import",{p_id:previewId,p_owner:String(user.id),p_phrase:String(phrase||"")});
 if(error||!data||!Number.isSafeInteger(data.imported)||data.imported<1||data.imported>100000||typeof data.supplierId!=="string"||!data.supplierId)return failure(error);
 return reply({...data,ok:true});
}

// Read the exact preview's committed result without retrying any write.
export async function readMaterialImportStatus(s,user,previewId){
 if(user?.role!=="owner")return reply({error:"Kun eier kan kontrollere prisimport."},403);
 if(process.env.VERCEL_ENV!=="production")return reply({error:"Importstatus er sperret i testmiljø."},403);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(previewId||"")))return reply({error:"Ugyldig forhåndsvisning."},400);
 const {data,error}=await s.from("material_import_previews").select("id,supplier_id,supplier_name,summary,created_at,applied_at").eq("id",previewId).eq("owner_id",String(user.id)).maybeSingle();
 if(error)return reply({error:"Kunne ikke lese importstatus."},503);
 if(!data)return reply({error:"Forhåndsvisningen ble ikke funnet."},404);
 if(data.applied_at){
  const imported=data.summary?.incoming;
  if(!Number.isSafeInteger(imported)||imported<1||imported>100000||!Number.isFinite(Date.parse(data.applied_at))||typeof data.supplier_id!=="string"||!data.supplier_id)
   return reply({error:"Importresultatet kunne ikke bekreftes. Kontroller katalogen før ny import."},503);
  return reply({ok:true,state:"applied",appliedAt:data.applied_at,imported,supplierId:data.supplier_id,supplierName:data.supplier_name});
 }
 const created=Date.parse(data.created_at);
 if(!Number.isFinite(created)||created>Date.now())return reply({error:"Importstatus kunne ikke bekreftes."},503);
 const expired=Date.now()-created>=30*60*1000;
 return reply({ok:true,state:expired?"expired":"unconfirmed",supplierId:data.supplier_id});
}
