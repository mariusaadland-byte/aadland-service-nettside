import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {vatTermBounds} from "../../../../../lib/invoiceVatTermReport";
import {buildVatSubmissionReview} from "../../../../../lib/vatSubmissionReview";
export const runtime="nodejs";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
async function collect(query,max=5000){
 const rows=[];
 for(let start=0;start<max;start+=500){
  const {data,error}=await query().range(start,start+499);
  if(error||!Array.isArray(data))throw Error("MVA-kontrollen mangler dokumenter. Ingen kontrollresultat kan vises.");
  rows.push(...data);
  if(data.length<500)return rows;
 }
 throw Error("For mange bilag til en fullstendig kontroll.");
}
async function fileIds(s,table,key,ids){
 const found=[];
 for(let start=0;start<ids.length;start+=100){
  const chunk=ids.slice(start,start+100);
  // A single bill may legitimately have multiple receipt images or PDF files.
  // The old 200-row cap rejected complete terms with >200 attachments per
  // 100 documents, even when all source data was present. Continue paging
  // and fail closed if the larger audited limit is reached.
  const rows=await collect(()=>s.from(table).select(key).in(key,chunk),5000);
  found.push(...rows.map(row=>row[key]));
 }
 return found;
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan se kontroll før MVA-innsending."},403);
 const url=new URL(req.url);
 let period;
 try{period=vatTermBounds(url.searchParams.get("year")||"",url.searchParams.get("term")||"");}
 catch(e){return json({error:e.message},400);}
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const [profile,filing,purchases,externalSales]=await Promise.all([
   s.from("vat_reporting_profile")
    .select("registration_date,first_term_year,first_term").eq("id","primary").maybeSingle(),
   s.from("vat_reporting_term_status")
    .select("year,term,status,filed_on").eq("year",period.year).eq("term",period.term).maybeSingle(),
   collect(()=>s.from("vat_purchase_documents").select("id,document_date,confirmed_at")
    .gte("document_date",period.from).lte("document_date",period.to).is("voided_at",null)
    .order("document_date",{ascending:true}).order("id",{ascending:true})),
   collect(()=>s.from("vat_external_sales_documents").select("id,document_date,confirmed_at")
    .gte("document_date",period.from).lte("document_date",period.to).is("voided_at",null)
    .order("document_date",{ascending:true}).order("id",{ascending:true}))
  ]);
  if(profile.error||filing.error)throw Error("MVA-registrering eller innsendingsstatus kunne ikke leses.");
  const [purchaseFileIds,externalFileIds]=await Promise.all([
   fileIds(s,"vat_purchase_document_files","purchase_document_id",purchases.map(row=>row.id)),
   fileIds(s,"vat_external_sales_files","external_document_id",externalSales.map(row=>row.id))
  ]);
  return json({period,review:buildVatSubmissionReview({
   period,profile:profile.data,filing:filing.data,purchases,externalSales,
   purchaseFileIds,externalFileIds
  })});
 }catch(e){
  return json({error:e.message||"MVA-kontrollen er ufullstendig."},503);
 }
}
