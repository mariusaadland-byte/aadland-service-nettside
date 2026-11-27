import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../../lib/auth";
import HandoverDemo from "../../../../../components/HandoverDemo";
export const dynamic="force-dynamic";
export default async function Page(){const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");return <main><Link href="/admin/utleie/signering/test">← Testpanel</Link><HandoverDemo/></main>;}
