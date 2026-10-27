import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {buildInvoiceDraftPdf} from "../../../../../lib/invoiceDraftPdf";
import {osloDateKey} from "../../../../../lib/osloTime";
import {makeSplitSelfTestDocs,splitSelfTestEmail,SPLIT_SELFTEST_RECIPIENT} from "../../../../../lib/invoiceSplitSelfTest";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const noCache={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow, noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers:noCache});

export async function GET(req){
 const admin=await getAdminUser();
 if(admin?.role!=="owner")return json({error:"Bare eieren kan bruke fakturatesten."},403);
 const part=new URL(req.url).searchParams.get("part");
 if(!["1","2"].includes(part))return json({error:"Velg del 1 eller del 2."},400);
 try{
  const today=osloDateKey(new Date());
  const doc=makeSplitSelfTestDocs(today)[Number(part)-1];
  const bytes=await buildInvoiceDraftPdf(doc);
  return new NextResponse(new Uint8Array(bytes),{headers:{
   ...noCache,"Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="TEST-Aadland-Service-Del-'+part+'.pdf"',
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"base-uri 'none'; frame-ancestors 'self'; object-src 'none'"
  }});
 }catch(error){
  console.error("SPLIT SELFTEST PDF",error?.message);
  return json({error:"Test-PDF kunne ikke bygges."},500);
 }
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const admin=await getAdminUser();
 if(admin?.role!=="owner")return json({error:"Bare eieren kan sende test-e-post."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Test-e-post kan bare sendes fra produksjonssiden."},403);
 const input=await req.json().catch(()=>({}));
 if(input?.action!=="send-to-company"||input?.confirmed!==true)
  return json({error:"Bekreft at test-e-posten bare skal sendes til firmaets adresse."},400);
 const apiKey=process.env.RESEND_API_KEY;
 if(!apiKey)return json({error:"E-post er ikke konfigurert."},503);
 const today=osloDateKey(new Date());
 try{
  // Deliberately no access to Supabase or invoice numbering.
  const docs=makeSplitSelfTestDocs(today);
  const attachments=await Promise.all(docs.map(async(doc,index)=>({
   filename:"TEST-Aadland-Service-Del-"+(index+1)+".pdf",
   content:(await buildInvoiceDraftPdf(doc)).toString("base64")
  })));
  const message=splitSelfTestEmail(docs,attachments);
  const {Resend}=await import("resend");
  const result=await new Resend(apiKey).emails.send(message,{
   // One identical self-test per Oslo date; repeat clicks reuse the same request.
   idempotencyKey:"invoice-split-selftest/"+today
  });
  if(result.error||!result.data?.id)throw Error("Resend bekreftet ikke testutsendelsen.");
  return json({ok:true,recipient:SPLIT_SELFTEST_RECIPIENT,
   message:"Test-e-post med to ugyldige demo-PDF-er er bekreftet mottatt av e-posttjenesten. Kontroller innboksen; faktisk levering er ikke garantert."});
 }catch(error){
  console.error("SPLIT SELFTEST MAIL",error?.message);
  return json({error:"E-posttjenesten bekreftet ikke testsendingen. Kontroller Resend-loggen før du prøver igjen."},502);
 }
}
