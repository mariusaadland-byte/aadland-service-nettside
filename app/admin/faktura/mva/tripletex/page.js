import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import TripletexReceiptsClient from "./TripletexReceiptsClient";
import TripletexSalesClient from "./TripletexSalesClient";
import VippsSettlementClient from "./VippsSettlementClient";
import TripletexApiConnectClient from "./TripletexApiConnectClient";

export const metadata={title:"Overfør bilag og fakturaer til Tripletex – Aadland Service",robots:{index:false,follow:false}};
export default async function TripletexReceiptsPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin");
 return <main className="admin" style={{display:"block",width:"100%",minWidth:0,maxWidth:1050,margin:"0 auto",padding:"20px 14px 70px"}}>
  <p><Link href="/admin/faktura/mva#flere-funksjoner">← MVA og kvitteringer</Link></p>
  <h1 style={{fontSize:"clamp(24px,4vw,32px)",margin:"12px 0 7px"}}>Tripletex – overfør fakturaer og kvitteringer</h1>
  <p style={{fontSize:13,color:"#635d54",lineHeight:1.5,marginBottom:20}}>Fakturaer som du har sendt til kunder og kvitteringer du har mottatt fra leverandører, overføres på forskjellige måter for å unngå dobbelt bokføring.</p>
  <nav aria-label="Gå direkte til regnskapsfunksjon" style={{display:"flex",gap:10,flexWrap:"wrap",margin:"0 0 20px"}}>
   <a href="#vipps-oppgjor" style={{display:"inline-flex",alignItems:"center",padding:"12px 16px",borderRadius:9,
    background:"#23394c",color:"#fff",fontSize:15,fontWeight:700,textDecoration:"none"}}>
    Vipps-oppgjør og avstemming
   </a>
   <a href="#tripletex-fakturaer" style={{display:"inline-flex",alignItems:"center",padding:"12px 16px",borderRadius:9,
    border:"1px solid #a8b0b7",color:"inherit",fontSize:14,textDecoration:"none"}}>
    Fakturaoverføringer
   </a>
  </nav>
  <TripletexApiConnectClient/>
  <section id="vipps-oppgjor" style={{marginTop:28,borderTop:"2px solid #dfd8ce",paddingTop:17,scrollMarginTop:24}}>
   <VippsSettlementClient/>
  </section>
  <section id="tripletex-fakturaer" style={{marginTop:28,borderTop:"2px solid #dfd8ce",paddingTop:17,scrollMarginTop:24}}>
   <TripletexSalesClient/>
  </section>
  <section style={{marginTop:28,borderTop:"2px solid #dfd8ce",paddingTop:17}}>
   <TripletexReceiptsClient/>
  </section>
 </main>;
}
