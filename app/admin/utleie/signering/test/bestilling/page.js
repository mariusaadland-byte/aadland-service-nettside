import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../../lib/auth";
import GroupCheckout from "../../../../../utleie/handlekurv/GroupCheckout";
export const dynamic="force-dynamic";
export const metadata={title:"Bestilling og signering – test",robots:{index:false,follow:false}};
const lines=[{itemId:"00000000-0000-4000-8000-000000000801",startDate:"2026-12-01",endDate:"2026-12-01",quantity:1}];
export default async function Page(){const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");return <main style={{maxWidth:800,margin:"auto",padding:16}}><Link href="/admin/utleie/signering/test">← Samlet testpanel</Link><GroupCheckout demo quote={{digest:"a".repeat(64),snapshot:{termsVersion:"2026-11-25",payableOre:30000,depositOre:50000}}} lines={lines}/></main>;}
