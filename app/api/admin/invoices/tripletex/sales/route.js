import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {summarizeInvoiceActivity} from "../../../../../../lib/invoiceSettlementInfo";
import {osloDateKey} from "../../../../../../lib/osloTime";
import {salesInvoiceExportOverview,tripletexSalesInvoiceCsv,salesInvoiceArchiveCsv} from "../../../../../../lib/tripletexSalesInvoiceExport";
import {zipFrozenInvoicePdfs} from "../../../../../../lib/zipFrozenInvoices";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive"};
const json=(obj,status=200)=>NextResponse.json(obj,{status,headers});
const invoiceColumns="id,status,title,customer,line_items,invoice_number,issued_date,issued_at,due_date,sent_at,paid_ore,credited_ore,pdf_base64,created_at";
async function allRows(s,table,columns,filter){
 const found=[];
 for(let offset=0;offset<5000;offset+=250){
  let q=s.from(table).select(columns).order("id",{ascending:true}).range(offset,offset+249);
  if(filter)q=filter(q);
  const r=await q;
  if(r.error||!Array.isArray(r.data))throw Error("Hele fakturahistorikken kunne ikke hentes.");
  found.push(...r.data);
  if(r.data.length<250)return found;
 }
 throw Error("For mange historiske fakturaer for én eksport.");
}
async function fetchIssued(s){
 const invoices=await allRows(s,"invoice_drafts",invoiceColumns,q=>q.eq("status","sent"));
 const payments=[],credits=[];
 for(let start=0;start<invoices.length;start+=100){
  const ids=invoices.slice(start,start+100).map(i=>i.id);
  for(const [table,columns,target] of [
   ["invoice_vipps_payments","id,invoice_id,state,captured_ore,refunded_ore",payments],
   ["invoice_credit_notes","id,invoice_id,total_ore,sent_at",credits]
  ]){
   const rows=await allRows(s,table,columns,q=>q.in("invoice_id",ids));
   target.push(...rows);
  }
 }
 return summarizeInvoiceActivity(invoices,payments,credits);
}
function importOptions(url){
 const from=Number(url.searchParams.get("startNumber")||"80000000");
 if(!Number.isSafeInteger(from)||from<10001||from>999999000)return null;
 const includePaid=url.searchParams.get("includePaid")==="1";
 const paymentType=String(url.searchParams.get("paymentType")||"").trim();
 if(includePaid&&!/^[A-Za-z0-9_-]{1,32}$/.test(paymentType))return null;
 return {startNumber:from,includePaid,paymentType};
}
const outCsv=(content,filename)=>new NextResponse(content,{headers:{
 ...headers,"Content-Type":"text/csv; charset=utf-8",
 "Content-Disposition":'attachment; filename="'+filename+'"',
 "X-Content-Type-Options":"nosniff"
}});
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan overføre fakturahistorikk."},403);
 const url=new URL(req.url),format=url.searchParams.get("format")||"overview";
 const options=importOptions(url);
 if(!options)return json({error:"Velg gyldig importnummer og eventuell betalingstype-ID."},400);
 if(!["overview","tripletex","archive","pdfzip"].includes(format))
  return json({error:"Ukjent eksportformat."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const issued=await fetchIssued(s);
  const overview=salesInvoiceExportOverview(issued,osloDateKey(new Date()));
  if(format==="tripletex"){
   const output=tripletexSalesInvoiceCsv(overview,options);
   return outCsv(output.csv,"Tripletex-fakturaimport-Aadland-Service.csv");
  }
  if(format==="archive")
   return outCsv(salesInvoiceArchiveCsv(overview,options),"Aadland-Service-alle-sendte-fakturaer.csv");
  if(format==="pdfzip"){
   const rows=overview.rows.filter(x=>Boolean(x.invoice.pdf_base64));
   if(!rows.length)return json({error:"Ingen fryste faktura-PDF-er er tilgjengelige."},404);
   const zip=zipFrozenInvoicePdfs(rows);
   return new NextResponse(new Uint8Array(zip),{headers:{
    ...headers,"Content-Type":"application/zip",
    "Content-Disposition":'attachment; filename="Aadland-Service-sendte-fakturaer-PDF.zip"',
    "X-Content-Type-Options":"nosniff"
   }});
  }
  const eligible=overview.rows.filter(x=>x.state==="unpaid"||(options.includePaid&&x.state==="paid"));
  return json({ok:true,summary:overview.summary,
   importableCount:eligible.length,
   counts:{eligibleWithPaymentType:overview.summary.unpaid+overview.summary.paid},
   rows:overview.rows.map(item=>({
    id:item.invoice.id,originalNumber:item.invoice.invoice_number,
    importNumber:String(options.startNumber+item.numberOffset),
    customerName:String(item.invoice.customer?.name||""),
    issuedDate:item.invoice.issued_date,dueDate:item.invoice.due_date,
    grossOre:item.payment?.gross||0,paidOre:item.payment?.paid||0,
    outstandingOre:item.payment?.outstanding||0,
    state:item.state,reason:item.reason,
    hasPdf:Boolean(item.invoice.pdf_base64)
   }))});
 }catch(error){
  console.error("TRIPLETEX OUTGOING INVOICE EXPORT",error?.message);
  return json({error:error?.message||"Kunne ikke lage fakturaeksport. Ingen data er endret."},503);
 }
}
