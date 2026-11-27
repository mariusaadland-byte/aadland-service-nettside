import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import SigningTestPanel from "../../../../components/SigningTestPanel";
export const dynamic="force-dynamic";
export const metadata={title:"Aadland Signering – testpanel",robots:{index:false,follow:false}};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/admin/utleie/signering">← Aadland Signering</Link><p><Link className="btn alt" href="/admin/utleie/signering/test/bestilling">Test bestilling og signering (demo)</Link></p><p><Link className="btn alt" href="/admin/utleie/signering/test/utlevering">Test utlevering og Vipps-trekk (demo)</Link></p><p><Link className="btn alt" href="/admin/utleie/signering/test/retur">Test retur og depositumsoppgjør (demo)</Link></p><p><Link className="btn alt" href="/admin/utleie/ordrer">Samlet ordreoversikt</Link></p><p><Link className="btn alt" href="/admin/utleie/okonomi">Økonomi og Vipps-rapporter</Link></p><p><Link className="btn alt" href="/admin/regnskap/felles">Felles økonomikontroll</Link></p><SigningTestPanel/></main>;
}
