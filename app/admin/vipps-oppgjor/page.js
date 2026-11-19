import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import VippsSettlementClient from "../faktura/mva/tripletex/VippsSettlementClient";

export const metadata={
 title:"Vipps-oppgjør og avstemming | Aadland Service",
 robots:{index:false,follow:false}
};

export default async function VippsOppgjorPage(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 return <main className="admin" style={{
  display:"block",width:"100%",minWidth:0,maxWidth:950,
  margin:"0 auto",padding:"22px 14px 70px"
 }}>
  <nav aria-label="Tilbake" style={{marginBottom:18,display:"flex",gap:14,flexWrap:"wrap"}}>
   <Link href="/admin">← Backoffice</Link>
   <Link href="/admin/vipps">Vipps-oppsett</Link>
   <Link href="/admin/faktura/mva/tripletex">Tripletex-overføringer</Link>
  </nav>
  <div style={{marginBottom:20}}>
   <p style={{fontSize:12,letterSpacing:1.2,fontWeight:700,
    color:"#596a76",margin:"0 0 6px"}}>AADLAND SERVICE · REGNSKAP</p>
   <h1 style={{fontSize:"clamp(26px,4vw,34px)",margin:"0 0 8px"}}>Vipps-oppgjør</h1>
   <p style={{lineHeight:1.55,maxWidth:700}}>
    Hent Vipps-oppgjør, se gebyrer og utbetalinger og sammenlign dem med
    registrerte fakturabetalinger før avstemming i Tripletex.
   </p>
  </div>
  <VippsSettlementClient/>
 </main>;
}
