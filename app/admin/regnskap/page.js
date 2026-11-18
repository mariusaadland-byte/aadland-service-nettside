import {redirect} from "next/navigation";
import Link from "next/link";
import {getAdminUser} from "../../../lib/auth";
import AccountingOverviewClient from "./AccountingOverviewClient";
export const metadata={title:"Regnskap og MVA – Aadland Service",robots:{index:false,follow:false}};
const views=new Set(["oversikt","betalt","ubetalt","bilag","mva","regnskapsark","overforinger"]);
export default async function AccountingPage({searchParams}){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 if(user.role!=="owner")redirect("/admin");
 const params=await searchParams;
 const view=views.has(params?.vis)?params.vis:"oversikt";
 return <main className="admin" style={{maxWidth:1250,margin:"0 auto",padding:"24px 18px 70px"}}>
  <p style={{margin:"0 0 14px",fontSize:13}}><Link href="/admin">← Tilbake til administrasjonen</Link></p>
  <AccountingOverviewClient initialView={view}/>
 </main>;
}
