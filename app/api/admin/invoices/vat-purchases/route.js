import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validateVatPurchaseInput} from "../../../../../lib/invoiceInputVat";
import {checkVatPurchaseDuplicate,vatDuplicateKey} from "../../../../../lib/vatPurchaseDuplicateCheck";
export const runtime="nodejs";
const json=(value,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

// One read-only source of truth for both on-screen lookups and server-side
// registration. Never assume that a partial/paginated result is complete.
async function getActivePurchaseDocuments(s){
 const all=[];
 for(let offset=0;offset<5000;offset+=500){
  const page=await s.from("vat_purchase_documents")
   .select("id,supplier_name,supplier_document_number,document_date,kind,base_ore,vat_ore,voided_at")
   .is("voided_at",null).order("id",{ascending:true}).range(offset,offset+499);
  if(page.error||!Array.isArray(page.data))
   throw Error("Kunne ikke kontrollere alle registrerte bilag. Prøv igjen.");
  all.push(...page.data);
  if(page.data.length<500)return all;
 }
 throw Error("Bilagsregisteret er for stort til sikker kontroll. Kontakt administrator.");
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere inngående MVA."},403);
 if(process.env.VERCEL_ENV==="preview")
  return json({error:"Bilag kan bare registreres på produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 if(body.action==="void"){
  if(!uuid(body.id)||typeof body.reason!=="string"||
   body.reason.trim().length<8||body.reason.trim().length>500||body.confirmed!==true)
   return json({error:"Velg bilaget og oppgi minst 8 tegn som begrunnelse."},400);
  const updated=await s.from("vat_purchase_documents").update({
   voided_at:new Date().toISOString(),void_reason:body.reason.trim(),voided_by:user.id
  }).eq("id",body.id).is("voided_at",null)
   .select("id,voided_at").maybeSingle();
  if(updated.error)return json({error:updated.error.message||"Bilaget kunne ikke oppheves."},409);
  if(!updated.data)return json({error:"Bilaget ble ikke funnet eller er allerede opphevet."},409);
  return json({ok:true,id:updated.data.id});
 }
 if(body.action!=="register")return json({error:"Ukjent bilagshandling."},400);
 let entry;
 try{entry=validateVatPurchaseInput(body);}catch(e){return json({error:e.message},400);}
 // Important: the client preflight is only a convenience. Even requests
 // sent directly to this API must pass the same live duplicate review.
 let previous;
 try{previous=await getActivePurchaseDocuments(s);}
 catch(e){return json({error:e.message},503);}
 const result=checkVatPurchaseDuplicate({
  supplierName:entry.supplier_name,documentNumber:entry.supplier_document_number,kind:entry.kind
 },previous);
 if(result.status==="duplicate")
  return json({error:"Dette leverandørbilaget er registrert fra før. Det kan ikke lagres på nytt.",
   duplicate:result},409);
 if(result.status==="possible"&&
  !(body.possibleDuplicateReviewed===true&&
    uuid(body.possibleDuplicateMatchId)&&body.possibleDuplicateMatchId===result.match?.id))
  return json({error:"Mulig dublett. Kontroller fakturanummer, leverandør og tidligere bilag før du bekrefter.",
   duplicate:result},409);
 if(result.status!=="clear"&&result.status!=="possible")
  return json({error:"Bilagsnummeret kunne ikke bekreftes. Ingen registrering ble utført."},503);
 const inserted=await s.from("vat_purchase_documents").insert({...entry,confirmed_by:user.id})
  .select("id,supplier_name,supplier_document_number,document_date,kind,base_ore,vat_ore,deductible_vat_ore")
  .single();
 if(inserted.error){
  const duplicate=inserted.error.code==="23505";
  return json({error:duplicate?
   "Dette leverandørbilaget er allerede registrert. Kontroller fakturanummer og leverandør.":
   inserted.error.message||"Bilaget kunne ikke registreres."},duplicate?409:503);
 }
 return json({ok:true,document:inserted.data},201);
}

 
// Owner-only read-only preflight. A bill number can already exist in a
// DIFFERENT MVA term, so searching only the active term is not sufficient.
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere bilagsnummer."},403);
 const params=new URL(req.url).searchParams;
 const input={supplierName:params.get("supplierName")||"",
  documentNumber:params.get("documentNumber")||"",kind:params.get("kind")||""};
 if(input.supplierName.trim().length<2||input.supplierName.length>160||
  !input.documentNumber.trim()||input.documentNumber.length>90||
  !["purchase","credit"].includes(input.kind))
  return json({error:"Oppgi leverandør, bilagsnummer og bilagstype før dublettkontrollen."},400);
 const s=db();if(!s)return json({error:"Kan ikke kontrollere tidligere bilag akkurat nå."},503);
 let all;
 try{all=await getActivePurchaseDocuments(s);}
 catch(e){return json({error:e.message},503);}
 const result=checkVatPurchaseDuplicate(input,all);
 return json({...result,key:vatDuplicateKey(input),checkedCount:all.length});
}
