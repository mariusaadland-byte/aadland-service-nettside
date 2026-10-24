import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {buildClosedInvoiceReport,closedInvoiceReportCsv} from "../../../../../lib/invoiceClosedReport";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const dateOk=v=>v===""||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v+"T00:00:00Z")));
async function allRows(builder,max=5000){
 const records=[];
 for(let start=0;start<max;start+=500){
  const found=await builder().range(start,start+499);
  if(found.error||!Array.isArray(found.data))
   throw Error("Rapportgrunnlaget kunne ikke hentes. Prøv igjen.");
  records.push(...found.data);
  if(found.data.length<500)return records;
 }
 throw Error("For mange fakturaer i rapporten. Eksporter et kortere tidsrom.");
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan hente regnskapsrapporten."},403);
 const url=new URL(req.url);
 const from=url.searchParams.get("from")||"",to=url.searchParams.get("to")||"";
 const format=url.searchParams.get("format")||"json";
 if(!dateOk(from)||!dateOk(to)||(from&&to&&from>to)||!["json","csv"].includes(format))
  return json({error:"Velg gyldige fra- og til-datoer."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  // Read only closed statuses. A reopened invoice is never counted.
  const closures=await allRows(()=>s.from("invoice_admin_closures")
   .select("invoice_id,closed_at").not("closed_at","is",null)
   .order("closed_at",{ascending:false}).order("invoice_id",{ascending:true}));
  if(!closures.length){
   const report=buildClosedInvoiceReport([],[],[],{from,to});
   if(format==="csv"){
    const bytes=Buffer.from(closedInvoiceReportCsv(report),"utf8");
    return new NextResponse(bytes,{headers:{
     "Content-Type":"text/csv; charset=utf-8",
     "Content-Disposition":'attachment; filename="avsluttede-fakturaer.csv"',
     "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"
    }});
   }
   return json(report);
  }
  const invoices=[],credits=[];
  const ids=[...new Set(closures.map(c=>c.invoice_id))];
  for(let start=0;start<ids.length;start+=100){
   const batch=ids.slice(start,start+100);
   const [invoiceBatch,creditBatch]=await Promise.all([
    allRows(()=>s.from("invoice_drafts")
     .select("id,status,invoice_number,issued_date,customer,line_items,paid_ore,credited_ore")
     .in("id",batch).order("id",{ascending:true}),500),
    allRows(()=>s.from("invoice_credit_notes")
     .select("id,invoice_id,lines,subtotal_ore,vat_ore,total_ore")
     .in("invoice_id",batch).order("id",{ascending:true}))
   ]);
   invoices.push(...invoiceBatch);
   credits.push(...creditBatch);
  }
  // Detect a manual reopening or automatic balance-triggered reopening while
  // the report was being assembled. Never export an outdated closure snapshot.
  const latestClosures=[];
  for(let start=0;start<ids.length;start+=100){
   const batch=ids.slice(start,start+100);
   const current=await allRows(()=>s.from("invoice_admin_closures")
    .select("invoice_id,closed_at").in("invoice_id",batch)
    .order("invoice_id",{ascending:true}),500);
   latestClosures.push(...current);
  }
  const latest=new Map(latestClosures.map(c=>[c.invoice_id,c.closed_at]));
  if(closures.some(c=>latest.get(c.invoice_id)!==c.closed_at))
   throw Error("En faktura er åpnet eller endret under rapporthentingen. Oppdater rapporten.");
  const report=buildClosedInvoiceReport(closures,invoices,credits,{from,to});
  if(format==="csv"){
   const bytes=Buffer.from(closedInvoiceReportCsv(report),"utf8");
   const filename="avsluttede-fakturaer-"+(from||"alle")+"-"+(to||"alle")+".csv";
   return new NextResponse(bytes,{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":'attachment; filename="'+filename+'"',
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"
   }});
  }
  return json(report);
 }catch(e){
  return json({error:e.message||"Rapporten kunne ikke kontrolleres."},503);
 }
}
