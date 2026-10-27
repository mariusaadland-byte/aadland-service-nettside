import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {osloDateKey} from "../../../../../../lib/osloTime";
import {buildInvoiceDraftPdf} from "../../../../../../lib/invoiceDraftPdf";
import {makeSplitSelfTestDocs} from "../../../../../../lib/invoiceSplitSelfTest";
import {invoiceSplitSelfTestReadiness} from "../../../../../../lib/invoiceSplitSelfTestReadiness";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{
 "Cache-Control":"private, no-store",
 "X-Robots-Tag":"noindex, nofollow, noarchive"
}});
export async function GET(){
 const admin=await getAdminUser();
 if(admin?.role!=="owner")return json({error:"Bare eieren kan kontrollere testoppsettet."},403);
 const today=osloDateKey(new Date());
 try{
  // No database, no invoice numbers, no email or cron invocation.
  const docs=makeSplitSelfTestDocs(today);
  const pdfs=await Promise.all(docs.map(doc=>buildInvoiceDraftPdf(doc)));
  const checks=invoiceSplitSelfTestReadiness(docs,pdfs,{
   emailConfigured:Boolean(process.env.RESEND_API_KEY),
   cronConfigured:Boolean(process.env.CRON_SECRET)
  });
  return json({ok:true,checkedOn:today,checks});
 }catch(error){
  console.error("INVOICE SPLIT SELFTEST READINESS",error?.message);
  return json({error:"Kontrollen av test-PDF-ene kunne ikke fullføres. Ingen e-post er sendt."},503);
 }
}
