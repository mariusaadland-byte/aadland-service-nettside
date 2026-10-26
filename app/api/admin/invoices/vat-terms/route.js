import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {buildInvoiceVatTermReport,invoiceVatTermCsv,vatTermBounds} from "../../../../../lib/invoiceVatTermReport";
import {calculateInputVatSummary,mergedVatReport,combinedVatCsv} from "../../../../../lib/invoiceInputVat";
import {calculateExternalSalesSummary,mergeExternalVatReport} from "../../../../../lib/vatExternalSales";
import {applyVatRegistrationGuard} from "../../../../../lib/vatRegistrationGuard";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function collect(query,max=5000){
 const rows=[];
 for(let start=0;start<max;start+=500){
  const result=await query().range(start,start+499);
  if(result.error||!Array.isArray(result.data))
   throw Error("Kunne ikke hente hele dokumentgrunnlaget. Rapporten er ikke fullstendig.");
  rows.push(...result.data);
  if(result.data.length<500)return rows;
 }
 throw Error("For mange dokumenter i valgt termin. Kontakt administrator.");
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan se MVA-avstemmingen."},403);
 const url=new URL(req.url);
 const year=url.searchParams.get("year")||"2026",term=url.searchParams.get("term")||"5";
 const format=url.searchParams.get("format")||"json";
 let bounds;
 try{bounds=vatTermBounds(year,term);}catch(e){return json({error:e.message},400);}
 if(!["json","csv"].includes(format))return json({error:"Velg gyldig rapportformat."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  // Both sides of the VAT report use original document dates, regardless
  // of payment/closing time. Never join on administrative closure.
  const [invoices,credits,purchases,externalSales,profile]=await Promise.all([
   collect(()=>s.from("invoice_drafts")
    .select("id,status,invoice_number,issued_date,customer,line_items,paid_ore,credited_ore")
    .gte("issued_date",bounds.from).lte("issued_date",bounds.to)
    .neq("status","draft")
    .order("issued_date",{ascending:true}).order("id",{ascending:true})),
   collect(()=>s.from("invoice_credit_notes")
    .select("id,invoice_id,credit_number,credit_date,original_invoice_number,customer,lines,subtotal_ore,vat_ore,total_ore")
    .gte("credit_date",bounds.from).lte("credit_date",bounds.to)
    .order("credit_date",{ascending:true}).order("id",{ascending:true})),
   collect(()=>s.from("vat_purchase_documents")
    .select("id,supplier_name,supplier_document_number,document_date,kind,evidence_reference,vat_groups,deduction_percent,base_ore,vat_ore,deductible_vat_ore,voided_at")
    .gte("document_date",bounds.from).lte("document_date",bounds.to)
    .is("voided_at",null)
    .order("document_date",{ascending:true}).order("id",{ascending:true})),
   collect(()=>s.from("vat_external_sales_documents")
    .select("id,customer_name,source_system,document_number,document_date,kind,original_document_number,vat_groups,base_ore,vat_ore,voided_at")
    .gte("document_date",bounds.from).lte("document_date",bounds.to)
    .is("voided_at",null)
    .order("document_date",{ascending:true}).order("id",{ascending:true})),
   s.from("vat_reporting_profile")
    .select("registration_date,first_term_year,first_term").eq("id","primary").maybeSingle()
  ]);
  if(profile.error)throw Error("MVA-registreringen kunne ikke kontrolleres. Rapporten vises ikke.");
  const report=applyVatRegistrationGuard(mergeExternalVatReport(mergedVatReport(
   buildInvoiceVatTermReport(invoices,credits,bounds),
   calculateInputVatSummary(purchases,bounds)
  ),calculateExternalSalesSummary(externalSales,bounds)),profile.data||null);
  if(format==="csv"){
   const data=Buffer.from(combinedVatCsv(report,invoiceVatTermCsv(report)),"utf8");
   return new NextResponse(data,{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="mva-avstemming-'+bounds.year+'-termin-'+bounds.term+'.csv"',
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"
   }});
  }
  return json(report);
 }catch(e){
  return json({error:e.message||"MVA-grunnlaget kunne ikke kontrolleres."},503);
 }
}
