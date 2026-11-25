import "server-only";

// This code handles ONLY Aadland Service's customer accept/decline confirmation.
// Every recipient has its own immutable delivery row. A claimed/uncertain row
// must NEVER be automatically resent, even after Resend's 24h key expires.
export const QUOTE_RESPONSE_NOTICE_MAX_QUEUED_AGE_MS=7*24*60*60*1000;
const SENDER="Aadland Service <post@aadland-service.no>";
const SERVICE_EMAIL="post@aadland-service.no";

const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);

export function buildQuoteResponseEmail(quote,notice){
 const accepted=notice.action==="accept",owner=notice.recipient_kind==="owner";
 const name=String(quote.customer?.name||"kunde").trim()||"kunde";
 const number=String(quote.quote_number||"");
 const title=String(quote.title||"tilbudet");
 const total=nok(quote.total_inc_vat_ore);
 if(owner){
  return {
   from:SENDER,to:SERVICE_EMAIL,replyTo:notice.recipient_kind==="owner"?
    (String(quote.customer?.email||"").trim()||undefined):undefined,
   subject:(accepted?"Tilbud godkjent – ":"Tilbud avslått – ")+number,
   text:[
    "Kunden har "+(accepted?"godkjent":"avslått")+" tilbud "+number+".",
    "Kunde: "+name,
    "Tilbud: "+title,
    "Beløp inkl. MVA: "+total,
    "Svaret er allerede registrert i tilbudssystemet.",
    "Kontroller status på Admin → Tilbud. Ikke registrer godkjenningen på nytt."
   ].join("\n")
  };
 }
 const headline=accepted?"Takk – tilbudet er godkjent":"Tilbakemeldingen er registrert";
 const paragraph=accepted?
  "Vi har registrert at du har godkjent tilbudet. Vi tar kontakt om videre plan og endelig oppstart.":
  "Vi har registrert at du har avslått tilbudet. Takk for tilbakemeldingen.";
 const planned=accepted&&quote.planned_start_date?
  new Date(String(quote.planned_start_date)+"T12:00:00").toLocaleDateString("nb-NO"):"";
 const html=`<!doctype html><html lang="no"><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:28px 30px;background:#0d0d0d;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">TILBUD ${esc(number)}</div></td></tr>
<tr><td style="padding:30px"><div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${accepted?"GODKJENT":"AVSLÅTT"}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${headline}</h1>
<p style="color:#c9c3b8;line-height:1.65">Hei ${esc(name)}. ${paragraph}</p>
<div style="padding:16px;background:#101010;border:1px solid #2d2d2d">
<div style="color:#8e887f;font-size:11px">Tilbud</div><div style="margin-top:5px;color:#fff;font-weight:700">${esc(title)}</div>
<div style="margin-top:12px;color:#8e887f;font-size:11px">Total inkl. MVA</div><div style="margin-top:5px;color:#fff;font-size:22px;font-weight:900">${esc(total)}</div>
${planned?`<div style="margin-top:12px;color:#8e887f;font-size:11px">Tidligst oppstart</div><div style="margin-top:5px;color:#fff">${esc(planned)}</div>`:""}
</div>
<a href="https://www.aadland-service.no/min-side" style="display:inline-block;margin-top:20px;background:#d7a74e;color:#111;text-decoration:none;font-weight:900;padding:13px 18px">Min side</a>
<p style="margin-top:24px;color:#999188;font-size:12px">Du kan svare på denne e-posten dersom noe må avklares.</p></td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#999188;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
 return {
  from:SENDER,to:notice.recipient_email,replyTo:SERVICE_EMAIL,
  subject:accepted?"Bekreftelse: tilbud "+number+" er godkjent":
   "Bekreftelse: tilbud "+number+" er avslått",
  html,
  text:["Hei "+name+".",paragraph,"Tilbud: "+number+" – "+title,
   "Total inkl. MVA: "+total,"Se historikken din på https://www.aadland-service.no/min-side"].join("\n")
 };
}
export function quoteResponseNotificationSummary(rows){
 const result={owner:"not_recorded",customer:"not_recorded",hasPending:false};
 for(const row of rows||[]){
  if(!["owner","customer"].includes(row.recipient_kind))continue;
  result[row.recipient_kind]=row.state;
 }
 result.hasPending=[result.owner,result.customer].some(x=>x!=="sent"&&x!=="not_recorded");
 return result;
}
function codeIssue(value){return String(value||"delivery_uncertain").slice(0,150)}
export async function sendOneQuoteResponseNotice(s,item,{now=new Date(),sendMail}={}){
 if(process.env.VERCEL_ENV!=="production"||!process.env.RESEND_API_KEY)
  return {recipientKind:item.recipient_kind,state:"queued",reason:"delivery_unavailable"};
 const nowDate=now instanceof Date?now:new Date(now);
 const {data:row,error:claimError}=await s.from("quote_response_notifications")
  .update({state:"claimed",claimed_at:nowDate.toISOString(),updated_at:nowDate.toISOString()})
  .eq("id",item.id).eq("state","queued")
  .select("id,quote_id,recipient_kind,recipient_email,action,state,attempt_number,created_at,released_at")
  .maybeSingle();
 if(claimError)return {recipientKind:item.recipient_kind,state:"needs_review",reason:"claim_failed"};
 if(!row)return {recipientKind:item.recipient_kind,state:"claimed",reason:"already_claimed"};
 const hold=async reason=>{
  const saved=await s.from("quote_response_notifications")
   .update({state:"needs_review",last_issue:codeIssue(reason),updated_at:new Date().toISOString()})
   .eq("id",row.id).eq("state","claimed");
  if(saved.error)console.error("QUOTE RESPONSE NOTICE HOLD FAILED",{kind:row.recipient_kind});
  return {recipientKind:row.recipient_kind,state:"needs_review",reason};
 };
 const since=Date.parse(String(row.released_at||row.created_at||""));
 if(!Number.isFinite(since)||nowDate.getTime()<since-5*60*1000||
    nowDate.getTime()-since>QUOTE_RESPONSE_NOTICE_MAX_QUEUED_AGE_MS)
  return hold("stale_queued_notice");
 const found=await s.from("quotes").select("*").eq("id",row.quote_id).maybeSingle();
 if(found.error||!found.data)return hold("quote_unavailable");
 const quote=found.data;
 if(quote.status!==(row.action==="accept"?"accepted":"declined"))
  return hold("quote_status_changed");
 if(row.recipient_kind==="customer"&&
   String(quote.customer?.email||"").trim().toLowerCase()!==row.recipient_email)
  return hold("recipient_changed");
 if(row.recipient_kind==="owner"&&row.recipient_email!==SERVICE_EMAIL)
  return hold("unexpected_owner_recipient");
 const payload=buildQuoteResponseEmail(quote,row);
 try{
  const send=sendMail||(async(data,options)=>{
   const {Resend}=await import("./safeResend");
   return new Resend(process.env.RESEND_API_KEY).emails.send(data,options);
  });
  const sent=await send(payload,{idempotencyKey:"quote-response/"+row.id+"/"+row.attempt_number});
  if(sent?.error||!sent?.data?.id)return hold("provider_status_unknown");
  const stored=await s.from("quote_response_notifications")
   .update({state:"sent",provider_email_id:String(sent.data.id),sent_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),last_issue:null})
   .eq("id",row.id).eq("state","claimed").select("id").maybeSingle();
  if(stored.error||!stored.data)return {recipientKind:row.recipient_kind,state:"needs_review",reason:"provider_sent_db_not_confirmed"};
  return {recipientKind:row.recipient_kind,state:"sent",providerAccepted:true};
 }catch{
  return hold("provider_status_unknown");
 }
}

export async function dispatchQueuedQuoteResponseNotices(s,{quoteId=null,limit=20,sendMail}={}){
 let query=s.from("quote_response_notifications")
  .select("id,quote_id,recipient_kind,recipient_email,action,state,attempt_number,created_at,released_at")
  .eq("state","queued")
  .order("created_at",{ascending:true}).limit(Math.min(Math.max(Number(limit)||1,1),30));
 if(quoteId)query=query.eq("quote_id",quoteId);
 const {data,error}=await query;
 if(error||!Array.isArray(data))return {ok:false,error:"Kunne ikke hente bekreftelseskøen."};
 const results=[];
 for(const item of data)results.push(await sendOneQuoteResponseNotice(s,item,{sendMail}));
 return {ok:true,checked:data.length,sent:results.filter(r=>r.state==="sent").length,
  requiresReview:results.filter(r=>r.state==="needs_review").length,
  results:results.map(x=>({recipientKind:x.recipientKind,state:x.state}))};
}
export async function getQuoteResponseNoticeSummary(s,quoteId){
 const {data,error}=await s.from("quote_response_notifications")
  .select("recipient_kind,state").eq("quote_id",quoteId);
 if(error)return {owner:"unknown",customer:"unknown",hasPending:true};
 return quoteResponseNotificationSummary(data);
}
