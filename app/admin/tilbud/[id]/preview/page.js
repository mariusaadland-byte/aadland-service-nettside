import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import QuotePreviewClient from "./QuotePreviewClient";

export default async function QuotePreviewPage({params}){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders||admin.canManageProducts))redirect("/admin");
 const resolved=await params;
 return <QuotePreviewClient quoteId={resolved.id}/>;
}
