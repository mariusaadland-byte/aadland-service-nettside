import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validateVatPurchaseInput} from "../../../../../lib/invoiceInputVat";
import {checkVatPurchaseDuplicate,vatDuplicateKey} from "../../../../../lib/vatPurchaseDuplicateCheck";
export const runtime="nodejs";
const json=(value,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

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
 const all=[];
 // Read the entire active register, not a date-filtered snapshot.
 // Fail closed if a query/page is incomplete; never claim "not found"
 // based on a partial list. The current register is small.
 for(let offset=0;offset<5000;offset+=500){
  const page=await s.from("vat_purchase_documents")
   .select("id,supplier_name,supplier_document_number,document_date,kind,voided_at")
   .is("voided_at",null).order("id",{ascending:true}).range(offset,offset+499);
  if(page.error||!Array.isArray(page.data))
   return json({error:"Kunne ikke kontrollere alle registrerte bilag. Prøv igjen."},503);
  all.push(...page.data);
  if(page.data.length<500)break;
  if(offset===4500)
   return json({error:"Bilagsregisteret er for stort til sikker kontroll. Kontakt administrator."},503);
 }
 const result=checkVatPurchaseDuplicate(input,all);
 return json({...result,key:vatDuplicateKey(input),checkedCount:all.length});
}
