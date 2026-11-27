import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import SigningPortalDemo from "../../../components/SigningPortalDemo";
export const dynamic="force-dynamic";
export const metadata={title:"Aadland Signering – demo",robots:{index:false,follow:false}};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p><Link className="btn alt" href="/admin/utleie/signering/test">Åpne signeringstestpanel</Link></p><SigningPortalDemo admin/></main>;
}
