import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import VippsInvoiceDemoClient from "./VippsInvoiceDemoClient";

export const metadata={title:"Vipps prøvekjøring – Aadland Service",robots:{index:false,follow:false}};
export default async function VippsInvoiceDemoPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||user.canUpdateOrders))redirect("/admin");
 return <main className="admin adminStandalonePage">
  <div className="adminPageTop">
   <div>
    <div className="kicker">SIMULERING – IKKE EKTE BETALING</div>
    <h1>Prøvekjør Vipps-faktura</h1>
    <p className="muted">Se hvordan betaling, delbetaling, refusjon og kvitteringer virker. Dette er en lokal demonstrasjon med oppdiktede beløp – ingen faktura blir utstedt, ingen kunde blir kontaktet og ingen betaling blir startet.</p>
   </div>
   <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    <Link className="btn alt" href="/admin/vipps">Vipps-oppsett</Link>
    <Link className="btn alt" href="/admin/faktura">Til fakturaer</Link>
   </div>
  </div>
  <section className="card" style={{padding:22,marginBottom:18}}>
   <div className="kicker">PDF FRA DEN EKTE FAKTURAMALEN</div>
   <h2>Se profesjonelle eksempelkvitteringer</h2>
   <p>Begge dokumentene lages av den samme PDF-motoren som kundekvitteringer, men inneholder bare fiktive opplysninger og tydelig TEST-merking. Ingen betaling eller e-post blir sendt.</p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <a className="btn alt" href="/api/demo/vipps-receipt-pdf?type=partial" target="_blank" rel="noreferrer">Åpne delbetalingskvittering (PDF)</a>
    <a className="btn alt" href="/api/demo/vipps-receipt-pdf?type=full" target="_blank" rel="noreferrer">Åpne fullt betalt kvittering (PDF)</a>
   </div>
  </section>
  <VippsInvoiceDemoClient/>
 </main>;
}
