import "server-only";
import {NextResponse} from "next/server";

const messages={
 S36_INVALID_IMPORT:"Ugyldig leverandør eller import.",
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
 const {data,error}=await s.rpc("preview_material_import",{p_supplier:supplierId,p_name:supplierName,p_filename:filename,p_owner:String(user.id),p_products:products,p_skipped:skipped});
 if(error||!data?.previewId)return failure(error);
 return reply({ok:true,preview:data});
}
export async function activateMaterialImport(s,user,{previewId,phrase}){
 if(user?.role!=="owner")return reply({error:"Kun eier kan aktivere leverandørpriser."},403);
 if(process.env.VERCEL_ENV!=="production")return reply({error:"Prisimport er sperret i testmiljø."},403);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(previewId||"")))return reply({error:"Ugyldig forhåndsvisning."},400);
 const {data,error}=await s.rpc("activate_material_import",{p_id:previewId,p_owner:String(user.id),p_phrase:String(phrase||"")});
 if(error||!data)return failure(error);
 return reply({ok:true,...data});
}
