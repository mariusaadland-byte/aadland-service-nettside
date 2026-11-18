import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import TripletexReceiptsClient from "./TripletexReceiptsClient";
import TripletexSalesClient from "./TripletexSalesClient";

export const metadata={title:"Overfør bilag og fakturaer til Tripletex – Aadland Service",robots:{index:false,follow:false}};
export default async function TripletexReceiptsPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin");
 return <main className="admin" style={{maxWidth:900,margin:"0 auto",padding:"20px 14px 70px"}}>
  <p><Link href="/admin/faktura/mva#flere-funksjoner">← MVA og kvitteringer</Link></p>
  <h1 style={{fontSize:"clamp(24px,4vw,32px)",margin:"12px 0 7px"}}>Tripletex – overfør fakturaer og kvitteringer</h1>
  <p style={{fontSize:13,color:"#635d54",lineHeight:1.5,marginBottom:20}}>Fakturaer som du har sendt til kunder og kvitteringer du har mottatt fra leverandører, overføres på forskjellige måter for å unngå dobbelt bokføring.</p>
  <TripletexReceiptsClient/>
  <section id="tripletex-fakturaer" style={{marginTop:38,borderTop:"2px solid #dfd8ce",paddingTop:17}}>
   <TripletexSalesClient/>
  </section>
 </main>;
}
