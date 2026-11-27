import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import SigningTestPanel from "../../../../components/SigningTestPanel";
export const dynamic="force-dynamic";
export const metadata={title:"Aadland Signering – testpanel",robots:{index:false,follow:false}};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/admin/utleie/signering">← Aadland Signering</Link><p><Link className="btn alt" href="/admin/utleie/signering/test/bestilling">Test bestilling og signering (demo)</Link></p><SigningTestPanel/></main>;
}
