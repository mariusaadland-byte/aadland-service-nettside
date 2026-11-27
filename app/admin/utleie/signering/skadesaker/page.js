import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import DamageAdminForm from "../../../../components/DamageAdminForm";
import {damageWriteEnabled} from "../../../../../lib/damageStorage";
import {adminDamageReturns} from "../../../../../lib/adminDamageReturns";
import DamagePortal from "../../../../components/DamagePortal";
export const dynamic="force-dynamic";
export const metadata={title:"Skadesaker – test",robots:{index:false,follow:false}};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const live=damageWriteEnabled();const result=live?await adminDamageReturns():null;
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/admin/utleie/signering">← Aadland Signering</Link>{live&&!result.ok?<p role="alert">Returregisteret kunne ikke hentes fullstendig. Ingen krav kan registreres.</p>:<DamageAdminForm demo={!live} rows={result?.rows||[]}/>}<DamagePortal admin/></main>;
}
