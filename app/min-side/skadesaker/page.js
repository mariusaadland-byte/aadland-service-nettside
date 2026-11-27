import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {customerDamageClaims,damagePortalEnabled} from "../../../lib/customerDamageClaims";
import DamagePortal from "../../components/DamagePortal";
export const dynamic="force-dynamic";
export const metadata={title:"Mine skadesaker",robots:{index:false,follow:false}};
export default async function Page(){
 const live=damagePortalEnabled();
 if(!live&&(process.env.VERCEL_ENV==="production"||process.env.NEXT_PUBLIC_SIGNING_PORTAL_DEMO!=="true"))notFound();
 const customerId=await getCustomerUserId();if(!customerId)redirect("/min-side");
 const result=live?await customerDamageClaims(customerId):null;
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/min-side">← Min side</Link>{live&&!result.ok?<p role="alert">Skadesakene kunne ikke hentes fullstendig.</p>:<DamagePortal demo={!live} rows={result?.rows?.map(({groupId,bookingId,...row})=>row)||[]} responseEnabled={live&&process.env.AADLAND_DAMAGE_RESPONSE_ENABLED==="true"}/>}</main>;
}
