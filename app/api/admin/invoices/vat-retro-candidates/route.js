import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {vatTermBounds} from "../../../../../lib/invoiceVatTermReport";
import {retroCandidateCutoff,summarizeRetroCandidates} from "../../../../../lib/vatRetroCandidates";
export const runtime="nodejs";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan se historiske MVA-kjøp."},403);
 const url=new URL(req.url);
 let period;
 try{period=vatTermBounds(url.searchParams.get("year")||"",url.searchParams.get("term")||"");}
 catch(e){return json({error:e.message},400);}
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const profile=await s.from("vat_reporting_profile")
   .select("registration_date,first_term_year,first_term").eq("id","primary").maybeSingle();
  if(profile.error)throw Error("Registreringsdatoen kunne ikke hentes.");
  const registration=profile.data;
  const first=registration&&Number(registration.first_term_year)===period.year&&
   Number(registration.first_term)===period.term;
  if(!first)return json({result:summarizeRetroCandidates(registration,period,[])});
  const cutoff=retroCandidateCutoff(registration.registration_date);
  if(!cutoff)throw Error("Registreringsdatoen er ugyldig.");
  const documents=[];
  for(let start=0;start<5000;start+=500){
   const {data,error}=await s.from("vat_purchase_documents")
    .select("id,document_date,supplier_name,supplier_document_number,kind,deductible_vat_ore,evidence_reference,voided_at")
    .gte("document_date",cutoff).lt("document_date",period.from)
    .is("voided_at",null).order("document_date",{ascending:true})
    .order("id",{ascending:true}).range(start,start+499);
   if(error||!Array.isArray(data))throw Error("Kunne ikke hente alle historiske kjøp.");
   documents.push(...data);
   if(data.length<500)return json({result:summarizeRetroCandidates(registration,period,documents)});
  }
  throw Error("For mange eldre bilag. Listen kan ikke fullføres sikkert.");
 }catch(e){return json({error:e.message||"Historiske bilag er ikke komplette."},503);}
}
