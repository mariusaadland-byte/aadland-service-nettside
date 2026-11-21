import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {createQuoteToken} from "../../../../lib/quoteLinks";
import {osloDateKey} from "../../../../lib/osloTime";

const MAX_PER_RUN=25;
const TWO_DAYS_MS=48*60*60*1000;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

function baseUrl(req){
 const configured=String(process.env.NEXT_PUBLIC_SITE_URL||"").replace(/\/$/,"");
 return configured||new URL(req.url).origin||"https://www.aadland-service.no";
}

export async function GET(req){
 const authError=cronGuard(req); if(authError)return authError;

 // Preview builds must never send messages to real customers, even if
 // deployment secrets accidentally include production Resend credentials.
 if(process.env.VERCEL_ENV==="preview")
  return NextResponse.json({ok:false,error:"Automatiske kundepåminnelser er sperret i preview."},{status:403});
 const resendKey=process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({ok:false,error:"RESEND_API_KEY mangler."},{status:503});

 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 const cutoff=new Date(Date.now()-TWO_DAYS_MS).toISOString();
 const today=osloDateKey(new Date());

 const {data,error}=await s.from("quotes")
  .select("id,quote_number,title,status,customer,total_inc_vat_ore,valid_until,sent_at,follow_up_sent_at,auto_follow_up,archived_at,issued_via,paper_issued_at")
  .eq("status","sent")
  .eq("auto_follow_up",true)
  .or("issued_via.is.null,issued_via.eq.email")
  .is("paper_issued_at",null)
  .is("follow_up_sent_at",null)
  .is("archived_at",null)
  .lte("sent_at",cutoff)
  .or("valid_until.is.null,valid_until.gte."+today)
  .order("sent_at",{ascending:true})
  .limit(MAX_PER_RUN);

 if(error){
  if(["42703","42P01"].includes(String(error.code||""))){
   return NextResponse.json({ok:true,setupRequired:true,sent:0,message:"quote_followups.sql er ikke kjørt ennå."});
  }
  console.error("QUOTE FOLLOWUP QUERY",error);
  return NextResponse.json({ok:false,error:"Tilbudene kunne ikke hentes."},{status:500});
 }

 const {Resend}=await import("resend");
 const resend=new Resend(resendKey);
 const base=baseUrl(req);
 let sentCount=0;
 let recoveredCount=0;
 let blockedCount=0;
 const failures=[];

 for(const quote of data||[]){
  const customerEmail=String(quote.customer?.email||"").trim().toLowerCase();
  let email=customerEmail;

  // Never follow up with an unrelated alternate recipient used for a test
  // or manual copy. Never guess after a failed log lookup.
  const last=await s.from("quote_send_log")
   .select("recipient,delivery_type")
   .eq("quote_id",quote.id).order("sent_at",{ascending:false})
   .limit(1).maybeSingle();
  if(last.error){
   failures.push({id:quote.id,error:"Utsendingshistorikk kunne ikke kontrolleres."});
   continue;
  }
  if(last.data?.recipient){
   const lastRecipient=String(last.data.recipient).trim().toLowerCase();
   if(last.data.delivery_type==="alternate"&&lastRecipient!==customerEmail){
    blockedCount++;
    continue;
   }
   if(lastRecipient!==customerEmail){
    blockedCount++;
    continue;
   }
   email=lastRecipient;
  }
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   blockedCount++;
   continue;
  }

  const {data:claim,error:claimError}=await s.rpc("claim_quote_followup",{
   p_quote_id:quote.id,p_recipient:email,p_cutoff:cutoff,p_local_today:today
  });
  if(claimError){
   console.error("QUOTE FOLLOWUP CLAIM",{quoteId:quote.id,code:claimError.code});
   failures.push({id:quote.id,error:"Påminnelsen kunne ikke låses i databasen."});
   continue;
  }
  if(claim?.state==="skipped"||claim?.state==="blocked"){
   blockedCount++;
   continue;
  }
  const key=String(claim?.key||"");
  if(!key){
   failures.push({id:quote.id,error:"Ugyldig idempotensnøkkel."});
   continue;
  }
  if(claim.state==="provider_accepted"){
   // An acknowledged email can be finalized without contacting Resend again.
   const done=await s.rpc("complete_quote_followup",{p_quote_id:quote.id,p_key:key});
   if(done.error){
    console.error("QUOTE FOLLOWUP RECOVERY",{quoteId:quote.id,code:done.error.code});
    failures.push({id:quote.id,error:"Tidligere bekreftet påminnelse krever manuell kontroll."});
   }else recoveredCount++;
   continue;
  }
  if(claim.state!=="claimed"){
   blockedCount++;
   continue;
  }

  // Re-check customer eligibility immediately before the external call.
  // A quote may have been answered or archived between listing and claim.
  const current=await s.from("quotes")
   .select("status,auto_follow_up,archived_at,valid_until,follow_up_sent_at,issued_via")
   .eq("id",quote.id).maybeSingle();
  const nowToday=osloDateKey(new Date());
  if(current.error||!current.data||current.data.status!=="sent"||
     current.data.auto_follow_up!==true||current.data.archived_at||
     current.data.follow_up_sent_at||current.data.issued_via==="paper"||
     (current.data.valid_until&&current.data.valid_until<nowToday)){
   const hold=await s.rpc("quote_followup_uncertain",{
    p_quote_id:quote.id,p_key:key,p_reason:"Tilbudsstatus ble endret før påminnelsen kunne sendes."
   });
   if(hold.error)console.error("QUOTE FOLLOWUP PRECHECK LOCK",{quoteId:quote.id,code:hold.error.code});
   blockedCount++;
   continue;
  }

  try{
   const token=createQuoteToken(quote);
   const link=base+"/tilbud/"+encodeURIComponent(quote.id)+"#token="+encodeURIComponent(token);
   const customerName=esc(quote.customer?.name||"kunde");
   const title=esc(quote.title||"tilbudet");
   const number=esc(quote.quote_number||"");
   const valid=quote.valid_until?new Date(quote.valid_until+"T12:00:00").toLocaleDateString("nb-NO"):"";

   const html=`<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,Helvetica,sans-serif;color:#181613">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #ded7cb">
<tr><td style="padding:28px 30px;background:#11100e;color:#fff"><div style="font-size:18px;font-weight:900;letter-spacing:.13em">AADLAND SERVICE</div><div style="margin-top:5px;color:#d9b365;font-size:11px;letter-spacing:.08em">AUTOMATISK OPPFØLGING</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#b5863b;font-size:11px;font-weight:800;letter-spacing:.12em">TILBUD ${number}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px">Har tilbudet kommet frem?</h1>
<p style="color:#625d55;line-height:1.65;margin:0 0 16px">Hei ${customerName}. Dette er en automatisk oppfølging fra Aadland Service. Vi vil bare sjekke at tilbudet om <b>${title}</b> kom frem til deg.</p>
<p style="color:#625d55;line-height:1.65;margin:0 0 20px">Du trenger ikke svare dersom du fortsatt vurderer tilbudet. Har du spørsmål, kan du svare direkte på denne e-posten.</p>
${valid?`<p style="color:#777;font-size:12px;margin:0 0 18px">Tilbudet er gyldig til ${esc(valid)}.</p>`:""}
<a href="${esc(link)}" style="display:inline-block;background:#cfa153;color:#111;text-decoration:none;font-weight:900;padding:14px 22px">Åpne tilbud →</a>
<p style="margin:26px 0 0;color:#8a847a;font-size:11px;line-height:1.55">Denne meldingen sendes bare én gang automatisk dersom tilbudet fortsatt står ubesvart etter omtrent to døgn.</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #ece7df;color:#777;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;

   const result=await resend.emails.send({
    from:"Aadland Service <post@aadland-service.no>",
    to:email,
    replyTo:"post@aadland-service.no",
    subject:"Har du mottatt tilbud "+quote.quote_number+"? – Aadland Service",
    html
   },{idempotencyKey:key});
   if(result?.error)throw new Error(result.error.message||"E-postfeil");
   const providerEmailId=String(result?.data?.id||"").trim();
   if(!providerEmailId)throw new Error("Resend svarte uten bekreftet meldings-ID.");
   const accepted=await s.rpc("quote_followup_provider_accepted",{
    p_quote_id:quote.id,p_key:key,p_provider_email_id:providerEmailId
   });
   if(accepted.error){
    // Resend may have accepted the email. Leave claim blocked for owner review.
    console.error("QUOTE FOLLOWUP PROVIDER ACK",{quoteId:quote.id,code:accepted.error.code});
    failures.push({id:quote.id,error:"Resend bekreftet sending, men registreringen feilet. Ikke send på nytt."});
    continue;
   }
   const completed=await s.rpc("complete_quote_followup",{p_quote_id:quote.id,p_key:key});
   if(completed.error){
    console.error("QUOTE FOLLOWUP COMPLETE",{quoteId:quote.id,code:completed.error.code});
    failures.push({id:quote.id,error:"E-post bekreftet, men oppdatering av påminnelsesstatus feilet."});
    continue;
   }
   sentCount+=1;
  }catch(sendError){
   failures.push({id:quote.id,error:"E-poststatus uavklart. Sendeprosessen er sperret til manuell kontroll."});
   console.error("QUOTE FOLLOWUP UNCERTAIN",{quoteId:quote.id,message:sendError?.message});
   const held=await s.rpc("quote_followup_uncertain",{
    p_quote_id:quote.id,p_key:key,p_reason:String(sendError?.message||sendError||"Ukjent feil").slice(0,180)
   });
   if(held.error)console.error("QUOTE FOLLOWUP UNCERTAIN SAVE",{quoteId:quote.id,code:held.error.code});
  }
 }

 return NextResponse.json({ok:true,checked:(data||[]).length,sent:sentCount,
  recovered:recoveredCount,blocked:blockedCount,failed:failures.length,failures});
}
