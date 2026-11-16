import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import TripletexReceiptsClient from "./TripletexReceiptsClient";
import TripletexSalesClient from "./TripletexSalesClient";

export const metadata={title:"Overfør kvitteringer til Tripletex – Aadland Service",robots:{index:false,follow:false}};
export default async function TripletexReceiptsPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin");
 return <main className="admin" style={{maxWidth:900,margin:"0 auto",padding:"20px 14px 70px"}}>
  <p><Link href="/admin/faktura/mva#flere-funksjoner">← MVA og kvitteringer</Link></p>
  <TripletexSalesClient/>
  <TripletexReceiptsClient/>
 </main>;
}
