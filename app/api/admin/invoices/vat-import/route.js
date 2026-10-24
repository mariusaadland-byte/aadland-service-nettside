import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {inspectVatImportRows,MAX_VAT_IMPORT_ROWS} from "../../../../../lib/vatPurchaseCsvImport";
export const runtime="nodejs";
const json=(value,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan forhåndsvise import av leverandørbilag."},403);
 if(Number(req.headers.get("content-length")||0)>500000)
  return json({error:"Filen er for stor for kontrollert import."},413);
 const body=await req.json().catch(()=>null);
 if(body?.action!=="preview"||!Array.isArray(body.rows)||
  body.rows.length<1||body.rows.length>MAX_VAT_IMPORT_ROWS)
  return json({error:"Send 1–50 CSV-rader for forhåndsvisning."},400);
 if(JSON.stringify(body).length>400000)
  return json({error:"For mange data i importfilen."},413);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const existing=[];
 try{
  // Fetch *all* active registrations before claiming anything is new.
  // Never classify a row as importable after a partial/paginated failure.
  for(let offset=0;offset<5000;offset+=500){
   const found=await s.from("vat_purchase_documents")
    .select("id,supplier_name,supplier_document_number,kind,document_date,base_ore,vat_ore,deductible_vat_ore,voided_at")
    .is("voided_at",null)
    .order("id",{ascending:true}).range(offset,offset+499);
   if(found.error||!Array.isArray(found.data))
    throw Error("Kunne ikke kontrollere tidligere registrerte bilag.");
   existing.push(...found.data);
   if(found.data.length<500)break;
   if(offset===4500)throw Error("For mange registrerte bilag. Import må deles opp med en tryggere søkemetode.");
  }
  const rows=inspectVatImportRows(body.rows,existing);
  const counts={
   new:rows.filter(x=>x.status==="new").length,
   existing:rows.filter(x=>x.status==="existing").length,
   conflict:rows.filter(x=>x.status==="conflict"||x.status==="review").length,
   invalid:rows.filter(x=>x.status==="invalid"||x.status==="duplicateInFile").length
  };
  return json({rows,counts,note:"Kun forhåndsvisning. Ingen bilag er registrert eller bokført."});
 }catch(e){
  return json({error:e.message||"Kontrollen kunne ikke fullføres. Ingen bilag ble registrert."},503);
 }
}
