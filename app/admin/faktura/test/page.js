import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import SplitInvoiceSelfTestClient from "./SplitInvoiceSelfTestClient";

export const metadata={title:"Prøvekjør deling av faktura – Aadland Service",robots:{index:false,follow:false}};
export default async function InvoiceSplitSelfTestPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin");
 return <main className="admin adminStandalonePage">
  <div className="adminPageTop">
   <div>
    <div className="kicker">TEKNISK TEST – INGEN EKTE FAKTURA</div>
    <h1>Prøvekjør deling av faktura i 2</h1>
    <p className="muted">Se begge fakturaene og test e-postvedlegg uten å opprette fakturanummer, kundekrav, MVA-posteringer eller regnskapsbilag.</p>
   </div>
   <Link className="btn alt" href="/admin/faktura">Til fakturakladdene</Link>
  </div>
  <section className="card" style={{padding:20}}>
   <h2>Eksempel: Faktura på 10 000 kr inkl. MVA</h2>
   <p><strong>Del 1:</strong> 40 % = 4 000 kr inkl. MVA. <strong>Del 2:</strong> 60 % = 6 000 kr inkl. MVA.</p>
   <p>Dette er faste eksempelbeløp. Ingen ekte kunde eller betalingsmottaker brukes. Sendingsdato og forfallsdato i demo-PDF-ene er kun illustrasjoner.</p>
  </section>
  <SplitInvoiceSelfTestClient/>
 </main>;
}
