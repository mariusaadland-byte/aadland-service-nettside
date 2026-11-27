import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {costHistoryEnabled} from "../../../../lib/costAllocationConfig";
import CostHistoryClient from "../CostHistoryClient";
export const dynamic="force-dynamic";
export default async function Page(){const u=await getAdminUser();if(!u)redirect("/admin/login");if(u.role!=="owner")redirect("/admin");return <main className="admin" style={{maxWidth:1000,margin:"0 auto",padding:24}}><Link href="/admin/regnskap/felles">← Felles økonomikontroll</Link><CostHistoryClient enabled={costHistoryEnabled()}/></main>;}
