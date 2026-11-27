import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import SharedFinanceControl from "../SharedFinanceControl";
export const dynamic="force-dynamic";
export const metadata={title:"Felles økonomikontroll – Aadland",robots:{index:false,follow:false}};
export default async function Page(){const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");return <main className="admin" style={{maxWidth:1250,margin:"0 auto",padding:"24px 18px 70px"}}><p><Link href="/admin/regnskap">← Regnskap</Link></p><SharedFinanceControl/></main>;}
