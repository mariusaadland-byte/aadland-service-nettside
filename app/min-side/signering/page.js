import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {getCustomerUserId} from "../../../lib/customer-auth";
import SigningPortalDemo from "../../components/SigningPortalDemo";
export const dynamic="force-dynamic";
export const metadata={title:"Mine avtaler – demo",robots:{index:false,follow:false}};
export default async function Page(){
 if(process.env.NEXT_PUBLIC_SIGNING_PORTAL_DEMO!=="true"||process.env.VERCEL_ENV==="production")notFound();
 const customerId=await getCustomerUserId();if(!customerId)redirect("/min-side");
 return <main style={{maxWidth:1100,margin:"auto",padding:16}}><Link href="/min-side">← Min side</Link><SigningPortalDemo/></main>;
}
