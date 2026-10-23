import Link from "next/link";
import {db} from "../../../../lib/supabase";
import {invoiceVippsReference} from "../../../../lib/invoiceVipps";
import {vippsCustomerOpenLink} from "../../../../lib/invoiceVippsLinks";

export const dynamic="force-dynamic";
export const metadata={title:"Betal faktura med Vipps – Aadland Service",robots:{index:false,follow:false}};

export default async function InvoiceVippsStart({searchParams}){
 const params=await searchParams;
 const reference=String(params?.reference||"");
 let state="missing",amountOre=0,link=null;
 if(invoiceVippsReference(reference)){
  const s=db();
  if(!s)state="unavailable";
  else{
   const r=await s.from("invoice_vipps_payments")
    .select("reference,state,delivery_method,redirect_url,amount_ore")
    .eq("reference",reference).maybeSingle();
   if(r.error)state="unavailable";
   else if(r.data&&r.data.delivery_method==="email_link"){
    amountOre=Number(r.data.amount_ore)||0;
    if(["paid","refunded","partial"].includes(r.data.state))state="finished";
    else if(r.data.state==="cancelled")state="expired";
    else if(["pending","authorized"].includes(r.data.state)){
     const result=vippsCustomerOpenLink(r.data.redirect_url);
     if(result.available){state="ready";link=result.href;}
     else state=result.reason==="expired"?"expired":"unavailable";
    }
   }
  }
 }
 const displayAmount=new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(amountOre/100);
 const text=state==="expired"?"Betalingslenken er utløpt. Be Aadland Service sende deg en ny betalingslenke. Du skal ikke betale den gamle lenken på nytt."
  :state==="finished"?"Betalingsforsøket er allerede avsluttet. Kontroller kvitteringen din eller kontakt Aadland Service ved spørsmål."
  :state==="unavailable"?"Vi kunne ikke åpne betalingslenken akkurat nå. Prøv igjen senere eller kontakt Aadland Service."
  :"Denne betalingslenken finnes ikke. Sjekk at du åpnet hele lenken fra Aadland Service.";
 return <main className="container" style={{maxWidth:620,padding:"48px 20px"}}>
  <h1>Betal med Vipps</h1>
  {state==="ready"?<>
   <p>Du skal betale <strong>{displayAmount}</strong> til Aadland Service.</p>
   <p>Trykk på knappen nedenfor for å åpne Vipps. Kontroller beløpet og godkjenn selv i Vipps-appen.</p>
   <a href={link} rel="noreferrer" referrerPolicy="no-referrer"
    style={{display:"inline-block",background:"#f36f36",color:"#fff",borderRadius:10,padding:"16px 22px",fontWeight:750,textDecoration:"none"}}>
    Åpne Vipps og betal {displayAmount}
   </a>
   <p style={{marginTop:24}}>Hvis Vipps ikke åpnes automatisk, bruk Safari på telefonen og trykk på knappen igjen. Betalingen er ikke gjennomført før du godkjenner den i Vipps.</p>
  </>:<p role="status">{text}</p>}
  <p><Link href="/">Til Aadland Service</Link></p>
 </main>;
}
