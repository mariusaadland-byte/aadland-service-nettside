import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import QuoteEditorClient from "../QuoteEditorClient";

export default async function NewQuotePage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(!(admin.role==="owner"||admin.canUpdateOrders||admin.canManageProducts))redirect("/admin");
 return <QuoteEditorClient/>;
}
